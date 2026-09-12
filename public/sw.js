/* eslint-env serviceworker */
/**
 * sw.js — the provider app's service worker.
 * ──────────────────────────────────────────────────────────────────────────
 * ONE job: receive a push and show it. This is deliberately NOT an offline
 * cache.
 *
 * The tenant app precaches its whole route graph because a tenant browses
 * listings on a train. A shopkeeper opens this app to answer an order that just
 * arrived, and answering it needs the network anyway — a cached shell that
 * renders a stale, empty order list would be worse than a clear "no connection"
 * page. The খাতা already handles its own offline case with a write queue, which
 * is the part that genuinely needs to work with no signal.
 *
 * So: no fetch handler, no precache, no cache-busting to get wrong.
 */

// Take over immediately. A shopkeeper who just allowed notifications and then
// gets nothing until he closes every tab would reasonably conclude it is
// broken.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'TO-LET PRO', body: event.data.text() };
    }
  }

  const title = data.title || 'নতুন অর্ডার';
  const options = {
    body: data.body || 'অ্যাপে দেখুন',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data,
    // Tagged per ORDER, so three pushes about one order replace each other
    // rather than stacking three rows on his lock screen.
    tag: data.requestId ? `svc-${data.requestId}` : 'svc',
    renotify: true,
    // A new order carries a 30-minute deadline that counts against him if he
    // misses it. That earns a notification which does not quietly disappear,
    // and a vibration he will feel from the next room.
    requireInteraction: data.type === 'service_request',
    vibrate: [200, 80, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';

  // Focus an open tab rather than opening a second one. A shopkeeper with the
  // app already up does not want a duplicate; he wants the one he has to move
  // to the order.
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) {
        if ('navigate' in client) await client.navigate(target).catch(() => {});
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
