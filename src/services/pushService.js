/**
 * pushService.js — putting an order on the shopkeeper's lock screen.
 * ──────────────────────────────────────────────────────────────────────────
 * An order gives him 30 minutes to answer. Miss it and it expires, the customer
 * is told nobody replied, and the silence counts against him as a no-show.
 * Until now his only warning was a WhatsApp message — a different app, on a
 * throttled gateway, with a paid SMS behind it.
 *
 * ─── PERMISSION IS NEVER ASKED FOR ON LOAD ───────────────────────────────────
 * `enable()` is only ever called from a deliberate tap. A browser permission
 * prompt thrown at somebody the moment the app opens is how people press Block,
 * and a blocked origin cannot be un-blocked from inside the app — it is a
 * setting buried in Chrome that this audience will never find. One wrong prompt
 * costs the channel permanently.
 */

import { apiFetch } from './apiClient.js';

const SW_PATH = '/sw.js';

export const isSupported = () => (
  typeof window !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window
);

export const permission = () => (isSupported() ? Notification.permission : 'unsupported');

/** base64url → the Uint8Array the PushManager wants. */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Register the worker. Safe to call repeatedly — the browser dedupes by scope,
 * and `ready` resolves once it is actually controlling the page.
 */
export async function registerWorker() {
  if (!isSupported()) return null;
  try {
    await navigator.serviceWorker.register(SW_PATH);
    return await navigator.serviceWorker.ready;
  } catch (err) {
    console.warn('[push] service worker registration failed:', err.message);
    return null;
  }
}

/**
 * Ask for permission, subscribe, and tell the server.
 *
 * @returns {Promise<{ok:boolean, reason?:string}>} — never throws, because
 *   every caller is a button and a thrown error there is just a broken button.
 */
export async function enable() {
  if (!isSupported()) return { ok: false, reason: 'unsupported' };

  // The key is FETCHED, not bundled: rotating VAPID keys would otherwise need
  // a frontend deploy, and until it shipped every new subscription would fail
  // silently.
  let publicKey;
  try {
    const { publicKey: key, configured } = await apiFetch('/merchant/push/key', { auth: false });
    if (!configured || !key) return { ok: false, reason: 'not_configured' };
    publicKey = key;
  } catch {
    return { ok: false, reason: 'key_unavailable' };
  }

  const result = await Notification.requestPermission();
  if (result !== 'granted') return { ok: false, reason: result };

  const reg = await registerWorker();
  if (!reg) return { ok: false, reason: 'no_worker' };

  try {
    // Reuse an existing subscription rather than minting a second for the same
    // device — the server upserts on endpoint, but two endpoints for one phone
    // is two notifications for one order.
    const existing = await reg.pushManager.getSubscription();
    const subscription = existing || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await apiFetch('/merchant/push/subscribe', {
      method: 'POST',
      body: { subscription: subscription.toJSON(), device: navigator.userAgent },
    });
    return { ok: true };
  } catch (err) {
    console.warn('[push] subscribe failed:', err.message);
    return { ok: false, reason: 'subscribe_failed' };
  }
}

/**
 * Stop this device receiving.
 *
 * Unsubscribes the browser AND tells the server, in that order, because a
 * server row for an endpoint the browser has already dropped is an endpoint
 * every future send fails on until a 410 prunes it.
 */
export async function disable() {
  if (!isSupported()) return { ok: false, reason: 'unsupported' };
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return { ok: true };

    const { endpoint } = subscription.toJSON();
    await subscription.unsubscribe().catch(() => {});
    await apiFetch('/merchant/push/subscribe', { method: 'DELETE', body: { endpoint } })
      .catch(() => {});
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** Is THIS device currently subscribed? */
export async function isEnabled() {
  if (!isSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    if (!reg) return false;
    return Boolean(await reg.pushManager.getSubscription());
  } catch {
    return false;
  }
}
