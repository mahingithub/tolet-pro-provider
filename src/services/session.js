/**
 * session.js
 * ──────────────────────────────────────────────────────────────────────────
 * Centralised, PROVIDER-namespaced session storage.
 *
 * Keys are prefixed `toletpro_provider:` for the same reason the admin console
 * prefixes its own: the three apps are separate origins today, but one shared
 * origin in the future must not let two token stores collide. The same human
 * can hold a tenant session in the public app and a provider session here, and
 * those are different sessions even though they are the same account.
 *
 * This module imports nothing else in the app, so both the API client and the
 * auth service can depend on it without a circular import.
 */

const KEY_TOKEN    = 'toletpro_provider:token';
const KEY_USER     = 'toletpro_provider:user';
// Which business is selected, for an owner who registers more than one.
const KEY_ACTIVE   = 'toletpro_provider:activeProviderId';
// Why the last session ended, survived across the bounce to /login so the
// login screen can explain itself instead of silently appearing mid-action.
const KEY_ENDED    = 'toletpro_provider:ended-reason';
const EVT_CLEARED  = 'toletpro-provider:session-cleared';

export const getToken = () => {
  try { return window.localStorage.getItem(KEY_TOKEN); } catch { return null; }
};

export const getUser = () => {
  try {
    const raw = window.localStorage.getItem(KEY_USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const getActiveProviderId = () => {
  try { return window.localStorage.getItem(KEY_ACTIVE); } catch { return null; }
};

export const setActiveProviderId = (id) => {
  try {
    if (id) window.localStorage.setItem(KEY_ACTIVE, String(id));
    else window.localStorage.removeItem(KEY_ACTIVE);
  } catch { /* private mode / quota — non-fatal */ }
};

/** Persist token and/or user. Pass only the fields you want to update. */
export function setSession({ token, user } = {}) {
  try {
    if (token) window.localStorage.setItem(KEY_TOKEN, token);
    if (user) window.localStorage.setItem(KEY_USER, JSON.stringify(user));
  } catch { /* private mode / quota — non-fatal */ }
}

/**
 * Wipe the provider session. Emits `session-cleared` so the auth context can
 * bounce to /login. Pass { silent: true } on a deliberate sign-out where the
 * caller updates state itself and doesn't want the event to double-fire.
 *
 * `reason` is one of the codes LoginPage knows how to explain
 * ('session_expired' | 'account_banned' | 'access_revoked'). Omit it for a
 * deliberate sign-out — there is nothing to explain.
 */
export function clearSession({ silent = false, reason = '' } = {}) {
  try {
    window.localStorage.removeItem(KEY_TOKEN);
    window.localStorage.removeItem(KEY_USER);
    window.localStorage.removeItem(KEY_ACTIVE);
    if (reason) window.localStorage.setItem(KEY_ENDED, reason);
    else window.localStorage.removeItem(KEY_ENDED);
  } catch { /* ignore */ }

  if (!silent) {
    try {
      window.dispatchEvent(new CustomEvent(EVT_CLEARED, { detail: { reason } }));
    } catch { /* ignore */ }
  }
}

/**
 * Read why the last session ended. Non-destructive on purpose: LoginPage reads
 * this from a useState initializer, and StrictMode invokes those twice in dev —
 * a read-and-delete would hand the second call an empty string and swallow the
 * message. Call clearSessionEndedReason() from an effect to consume it.
 */
export function getSessionEndedReason() {
  try { return window.localStorage.getItem(KEY_ENDED) || ''; } catch { return ''; }
}

/** Forget the reason, so it is shown exactly once. Idempotent. */
export function clearSessionEndedReason() {
  try { window.localStorage.removeItem(KEY_ENDED); } catch { /* ignore */ }
}

export const onSessionCleared = (handler) => {
  window.addEventListener(EVT_CLEARED, handler);
  return () => window.removeEventListener(EVT_CLEARED, handler);
};
