/**
 * providerService.js — the business, its listing, its orders and its reviews.
 * ──────────────────────────────────────────────────────────────────────────
 * ─── TWO PREFIXES, AND THE DIFFERENCE MATTERS ────────────────────────────────
 *
 *   /providers/*          the business itself — registration, prices, the
 *                         খোলা/বন্ধ switch, the ROI numbers.
 *   /merchant/requests/*  the ORDER INBOX and the right of reply.
 *
 * The second one is not decoration. `/api/service-requests` is the TENANT's
 * surface, behind requireAuth and scoped to `tenantId` — a merchant token is
 * rejected there outright, because the two live in different identity systems
 * with different token audiences. This client used to call `/service-requests/
 * :id/accept`, which does not exist on either surface and never will: accepting
 * is something only the shop can do, so it lives behind the merchant gate.
 *
 * Every path below is live. The category registry is still FETCHED rather than
 * bundled — the definition drives the registration form, the listing editor and
 * server-side validation from one place, and a copy baked into this app would
 * fork it and guarantee a "the form asked for a field the API rejects" bug the
 * first time a category changes.
 */

import { apiFetch } from './apiClient.js';

// ─── Categories ──────────────────────────────────────────────────────────────

/** The category registry — config/serviceCategories.js, served. */
export const getCategories = () => apiFetch('/services/categories', { auth: false });

// ─── My businesses ───────────────────────────────────────────────────────────

export const listMyProviders = () => apiFetch('/providers/mine');

export const getProvider = (id) => apiFetch(`/providers/${id}`);

/** Create a draft. Saved at every step so an interrupted signup resumes. */
export const createProvider = (payload) =>
  apiFetch('/providers', { method: 'POST', body: payload });

export const updateProvider = (id, payload) =>
  apiFetch(`/providers/${id}`, { method: 'PATCH', body: payload });

/**
 * Save the category-specific answers. The server re-validates against
 * validateProviderFields() — this client never decides what is valid.
 *
 * `partial` is what makes save-at-every-step work: a wizard step posts only
 * its own fields and must not be rejected for the ones on a later screen. The
 * server MERGES a partial save rather than replacing, so an interrupted
 * registration never loses what came before. Required fields are enforced
 * exactly once, at submit.
 */
export const updateFields = (id, fields, { partial = false } = {}) =>
  apiFetch(`/providers/${id}/fields${partial ? '?partial=1' : ''}`, {
    method: 'PATCH',
    body: { fields },
  });

/** Submit for review. Moves draft → pending_review. */
export const submitForReview = (id) =>
  apiFetch(`/providers/${id}/submit`, { method: 'POST' });

/** The খোলা / বন্ধ switch. The single most important control in this app. */
export const setOpenNow = (id, openNow) =>
  apiFetch(`/providers/${id}/open`, { method: 'POST', body: { openNow } });

// ─── The order inbox ─────────────────────────────────────────────────────────
// All behind requireMerchantAuth. The server re-derives which businesses this
// merchant owns on every call and never trusts a providerId from the client —
// so `providerId` below is a FILTER, not a claim, and one he does not own
// simply returns an empty list.

/**
 * His inbox. Defaults server-side to OPEN requests only (placed / accepted /
 * on the way), oldest first — the one closest to expiring is the one he needs
 * to see, not the newest.
 */
export const listRequests = ({ providerId, status, limit } = {}) => {
  const qs = new URLSearchParams();
  if (providerId) qs.set('providerId', providerId);
  if (status) qs.set('status', status);
  if (limit) qs.set('limit', String(limit));
  const q = qs.toString();
  return apiFetch(`/merchant/requests${q ? `?${q}` : ''}`);
};

export const acceptRequest = (id) =>
  apiFetch(`/merchant/requests/${id}/accept`, { method: 'POST' });

/**
 * Declining honestly costs a provider nothing — only silence and
 * cancelling-after-accepting count against him. The reason is passed straight
 * through to the tenant, so it must be his words, not a generic code.
 */
export const declineRequest = (id, reason) =>
  apiFetch(`/merchant/requests/${id}/decline`, { method: 'POST', body: { reason } });

export const markOnTheWay = (id) =>
  apiFetch(`/merchant/requests/${id}/on-the-way`, { method: 'POST' });

/**
 * `finalTotal` is what actually changed hands — for a `request` it is agreed on
 * the phone, so it is asked for rather than assumed. Omit it and the quoted
 * total stands.
 */
export const completeRequest = (id, finalTotal) =>
  apiFetch(`/merchant/requests/${id}/complete`, {
    method: 'POST',
    body: finalTotal == null ? {} : { finalTotal },
  });

export const cancelRequest = (id, reason) =>
  apiFetch(`/merchant/requests/${id}/cancel`, { method: 'POST', body: { reason } });

// ─── Reviews ─────────────────────────────────────────────────────────────────

/**
 * Reviews of the shops he owns. `unanswered` is the default view on the screen:
 * he opens it looking for what to reply to, not for a wall of five-star rows.
 */
export const listReviews = ({ unanswered } = {}) =>
  apiFetch(`/merchant/requests/reviews${unanswered ? '?unanswered=1' : ''}`);

/**
 * The right of reply — the most valuable control in this app after খোলা/বন্ধ.
 * On a hyperlocal listing a calm answer to a bad review does more for a shop
 * than the review costs it. He can rewrite his own reply forever; he can never
 * touch the review itself, and the server enforces that rather than this
 * client.
 */
export const replyToReview = (id, text) =>
  apiFetch(`/merchant/requests/reviews/${id}/reply`, { method: 'POST', body: { text } });

// ─── Earnings / reach ────────────────────────────────────────────────────────

/**
 * The provider's own numbers — views, calls, orders, repeat customers.
 *
 * `range` must be one of '7d' | '30d' | '90d' | 'all'; anything else falls back
 * to 30 days server-side, and the response echoes the range that was actually
 * APPLIED so this client never has to guess. For `contact`-tier categories (গৃহকর্মী, ইলেকট্রিশিয়ান,
 * প্লাম্বার) there are no orders at all, so the CALL COUNT is the entire
 * return-on-investment story for the registration fee. It is not a vanity
 * metric and it is not admin-only.
 *
 * Views come back as a count and never as identities: browsing a shop is not
 * consent to hand that shop your name and number.
 */
export const getStats = (providerId, range = '30d') =>
  apiFetch(`/providers/${providerId}/stats?range=${encodeURIComponent(range)}`);

// ─── Delivery tracking ───────────────────────────────────────────────────────
// A shop's delivery boy is a teenager on a borrowed phone who changes every few
// weeks. He will never install an app or hold an account here, so tracking is a
// LINK: the shopkeeper mints one, sends it over WhatsApp, the boy opens it, and
// both the shop and the customer watch the same dot.

/**
 * Mint the link. Idempotent — a second tap returns the EXISTING track with
 * `reused: true` and `url: null`, because only the hash of the token was kept
 * and the original link is already in a WhatsApp thread.
 *
 * Refused with `not_trackable` before the order is accepted, and with
 * `no_destination` when the customer never shared a location.
 */
export const createDeliveryTrack = (requestId) =>
  apiFetch(`/merchant/requests/${requestId}/track`, { method: 'POST' });

/** Where the courier has got to. `track` is null until a link exists. */
export const getDeliveryTrack = (requestId) =>
  apiFetch(`/merchant/requests/${requestId}/track`);

/** Kill the link. A forwarded copy stops working immediately. */
export const endDeliveryTrack = (requestId) =>
  apiFetch(`/merchant/requests/${requestId}/track/end`, { method: 'POST' });
