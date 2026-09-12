/**
 * courierService.js — the delivery boy's two calls.
 * ──────────────────────────────────────────────────────────────────────────
 * NO AUTH, and that is the whole design. The token in the URL is the entire
 * credential, because the person using this page is a teenager on a borrowed
 * phone who changes every few weeks and will never hold an account here.
 *
 * It is safe only because of what the token cannot do: it is scoped to one
 * order, exposes no customer identity beyond a destination point, cannot move
 * the order's status, and expires the same day.
 *
 * Deliberately NOT routed through apiClient.js: that module attaches the
 * merchant Bearer token and ends the session on a 401. This page has no session
 * to end, and a courier opening it on a phone that happens to have a
 * shopkeeper's token in storage must not be treated as that shopkeeper.
 */

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api')
  .replace(/\/+$/, '');

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `HTTP ${res.status}`);
    err.code = data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

/** What am I delivering, and where. */
export const openTrack = (token) => call(`/delivery/${encodeURIComponent(token)}`);

/** Where I am now. Called every few seconds while the page is open. */
export const ping = (token, { lat, lng, accuracy }) =>
  call(`/delivery/${encodeURIComponent(token)}/ping`, {
    method: 'POST',
    body: { lat, lng, accuracy, device: navigator.userAgent },
  });

/** Handed it over. A hint for the shop — it does not close the order. */
export const finish = (token) =>
  call(`/delivery/${encodeURIComponent(token)}/done`, { method: 'POST' });
