/**
 * apiClient.js
 * ──────────────────────────────────────────────────────────────────────────
 * The single fetch wrapper for the provider app. Every service goes through
 * `apiFetch`, which:
 *   - resolves paths against VITE_API_BASE_URL (e.g. http://localhost:5000/api)
 *   - attaches the Bearer token
 *   - normalises errors to `{ message, code, status, serverMessage }`
 *   - on a 401, refreshes the access token once and replays the request
 *
 * Adapted from the admin console's client, against a THIRD auth surface.
 * A merchant is not a To-Let Pro user at all: he signs in at
 * `/api/merchant/auth/*` against his own collection, and his token carries the
 * audience 'tolet-pro-provider'. A tenant's token is rejected by every route
 * this client calls, and this client's token is rejected by every rental
 * route — the two systems are isolated cryptographically, not by a role check.
 *
 * The rule the admin client learned the hard way, kept verbatim here: end the
 * session ONLY when the server has positively said the session is over. An
 * expired access token is the NORMAL state minutes after login, and a 429, a
 * 5xx or a dropped connection says nothing at all about the session. On the
 * networks this app runs on, treating every hiccup as a logout would sign a
 * shopkeeper out several times a day — which is precisely what happened while
 * this surface had no refresh route and `token_expired` was treated as fatal.
 */

import { getToken, setSession, clearSession } from './session.js';

export const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
).replace(/\/$/, '');

// ─── Token refresh ──────────────────────────────────────────────────────────
// POST /api/merchant/auth/refresh exchanges the httpOnly `merchantRefreshToken`
// cookie for a fresh access token, ROTATING the refresh token in the same step.
//
// This machinery was stripped out while that route did not exist, and the
// comment in its place said so — an expired token meant signing in again, so
// the access token's lifetime WAS the session's lifetime. On the networks this
// app runs on that signed a shopkeeper out several times a day.
//
// Rotation is why `credentials: 'include'` matters on every call here: the new
// cookie arrives on the refresh response and the browser stores it. Nothing in
// this file ever sees the refresh token itself, which is the point — a token
// the page's JavaScript can read is a token an injected script can steal.
const REFRESH_PATH = '/merchant/auth/refresh';

const NO_AUTH_PATHS = [
  '/merchant/auth/login',
  '/merchant/auth/signup/start',
  '/merchant/auth/signup/verify',
  REFRESH_PATH,
];

/**
 * 401 codes that end the session OUTRIGHT, with no refresh worth attempting.
 *
 * `token_expired` is deliberately NOT here. An expired access token is the
 * normal state fifteen minutes after login and is exactly what the refresh
 * route exists for; treating it as terminal is the bug this whole file warns
 * about in its header.
 */
const TERMINAL_AUTH_CODES = new Set([
  'invalid_token',
  'missing_token',
  'merchant_missing',
  'session_revoked',
  'password_changed',
]);

/**
 * Refresh failures that mean the session is genuinely over, as opposed to a
 * gateway having a bad minute. Anything not in here — a 500, a 429, a dropped
 * connection — leaves the session alone and the caller simply sees its error.
 */
const TERMINAL_REFRESH_CODES = new Set([
  'missing_refresh_token',
  'invalid_refresh_token',
  'account_banned',
]);

/**
 * Why the last refresh failed, so the 401 handler can tell "the server said
 * this session is over" from "the refresh never got through". Without it a
 * single flaky minute reads exactly like a revoked session.
 */
let lastRefreshOutcome = null;

/** True when the server has positively said this session is finished. */
export const isProviderSessionTerminated = () => Boolean(lastRefreshOutcome?.terminal);

/**
 * 403 codes meaning this account is finished. Deliberately narrow — a
 * legitimate 403 on one endpoint is not a dead session.
 */
const TERMINAL_ACCESS_CODES = new Set(['account_banned']);

function endSession(reason) {
  // Idempotent: a screen firing several requests in parallel gets several
  // matching failures, and without this guard each would dispatch its own
  // session-cleared event.
  if (!getToken()) return;
  clearSession({ reason });
}

const buildUrl = (path) => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
const isAuthPath = (path) => NO_AUTH_PATHS.some((p) => path.includes(p));

function toError(status, data) {
  const err = new Error(data.message || data.code || `অনুরোধ ব্যর্থ হয়েছে (HTTP ${status})।`);
  err.code = data.code;
  err.status = status;
  err.serverMessage = data.message;
  err.details = data.details;
  return err;
}

// ─── Single-flight refresh ──────────────────────────────────────────────────
// A shared promise rather than a subscriber list: every concurrent 401 awaits
// the same promise, so none of them can miss a flush and hang on a spinner.
let refreshPromise = null;

/** Resolves to `null` on success, or to the Error that stopped it. */
async function performRefresh() {
  let res;
  let data = {};
  try {
    res = await fetch(buildUrl(REFRESH_PATH), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // the httpOnly refresh cookie
    });
    data = await res.json().catch(() => ({}));
  } catch (netErr) {
    // Never reached the server, so this says nothing about the session.
    lastRefreshOutcome = { terminal: false, code: 'network_error', status: null, at: Date.now() };
    return netErr;
  }

  if (res.ok && data.token) {
    // The server calls it `merchant`; session.js calls it `user`. Reading
    // `data.user` here silently stored nothing and left a stale profile on
    // screen after every refresh.
    setSession({ token: data.token, user: data.merchant });
    lastRefreshOutcome = null;
    return null;
  }

  if (res.ok) {
    lastRefreshOutcome = { terminal: false, code: 'no_token_returned', status: res.status, at: Date.now() };
    return new Error('Refresh returned no token');
  }

  lastRefreshOutcome = {
    terminal: TERMINAL_REFRESH_CODES.has(data.code),
    code: data.code || null,
    status: res.status,
    at: Date.now(),
  };
  return toError(res.status, data);
}

function refreshOnce() {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export async function apiFetch(path, options = {}) {
  const {
    method = 'GET',
    body,
    auth = true,
    headers = {},
    // Set internally when replaying after a successful refresh, so one failed
    // retry can't loop.
    _isRetry = false,
  } = options;

  const finalHeaders = { 'Content-Type': 'application/json', ...headers };
  if (auth) {
    const token = getToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(buildUrl(path), {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });
  } catch (netErr) {
    const err = new Error('ইন্টারনেট সংযোগে সমস্যা হচ্ছে।');
    err.code = 'network_error';
    err.cause = netErr;
    throw err;
  }

  let data;
  try { data = await res.json(); } catch { data = {}; }

  if (res.ok) return data;

  // ── 401: try a refresh once, then replay ──────────────────────────────────
  // A failed sign-in attempt is not a dead session — there was never one — and
  // neither is an expired access token, which is what the refresh is for.
  if (res.status === 401 && auth && !isAuthPath(path)) {
    // Checked on the REPLAY too, not only the first attempt: a token that was
    // just refreshed and is still rejected as revoked is a finished session,
    // and skipping this on the retry would leave the shopkeeper looping on an
    // error toast with a dead token in local storage.
    if (TERMINAL_AUTH_CODES.has(data.code)) {
      endSession(data.code === 'session_revoked' ? 'access_revoked' : 'session_expired');
      throw toError(res.status, data);
    }

    if (!_isRetry) {
      // Single-flight: every concurrent 401 awaits the SAME promise, so a
      // screen firing five requests at once produces one refresh rather than
      // five — and none of them can miss a flush and hang on a spinner.
      const refreshErr = await refreshOnce();
      if (!refreshErr) {
        return apiFetch(path, { ...options, _isRetry: true });
      }

      // End the session only when the server positively said so. A 5xx, a 429
      // or a dropped connection says nothing about whether it is still valid.
      if (lastRefreshOutcome?.terminal) {
        endSession(lastRefreshOutcome.code === 'account_banned'
          ? 'account_banned' : 'session_expired');
      }
    }
  }

  if (res.status === 403 && auth && TERMINAL_ACCESS_CODES.has(data.code)) {
    endSession('account_banned');
  }

  throw toError(res.status, data);
}
