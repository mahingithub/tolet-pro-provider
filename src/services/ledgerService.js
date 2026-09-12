/**
 * ledgerService.js — তালি খাতা.
 * ──────────────────────────────────────────────────────────────────────────
 * The shopkeeper's own credit book. Every call is scoped to him server-side;
 * there is no shared ledger and nothing here is visible to a tenant or an
 * admin.
 *
 * `clientEntryId` on every write is not optional. He writes entries standing
 * in a shop on two bars of signal, so the same entry WILL be sent twice — the
 * server returns the original rather than creating a second, which is the only
 * thing standing between a retry and a doubled debt.
 */

import { apiFetch } from './apiClient.js';

/** A stable id for one logical entry, carried across every retry of it. */
export function newClientEntryId() {
  // crypto.randomUUID is unavailable on older Android WebViews, which is a
  // large share of this audience — fall back rather than throw.
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── The number he opens the app for ────────────────────────────────────────
// { willReceive, willPay, parties, owing, today: { sale, expense, … } }
export const getSummary = async () => (await apiFetch('/ledger/summary')).summary;

// ─── Parties ────────────────────────────────────────────────────────────────

/** `owing: true` → only people who currently owe him. */
export const listParties = ({ q = '', owing = false } = {}) => {
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  if (owing) qs.set('owing', '1');
  const s = qs.toString();
  return apiFetch(`/ledger/parties${s ? `?${s}` : ''}`);
};

/**
 * Create a page. The server hands back the EXISTING party when the phone is
 * already on file (`existing: true`) rather than making a rival page — adding
 * the same person twice is how one debt silently becomes two half-debts.
 */
export const createParty = (payload) =>
  apiFetch('/ledger/parties', { method: 'POST', body: payload });

export const getParty = (id) => apiFetch(`/ledger/parties/${id}`);

export const updateParty = (id, payload) =>
  apiFetch(`/ledger/parties/${id}`, { method: 'PATCH', body: payload });

/**
 * Nudge a customer about what he owes.
 *
 * The recipient is NOT a user of this platform. The server refuses unless the
 * merchant opted in for this person, there is actually a balance owing, a
 * phone number exists, and nothing was sent in the last week — so a rejection
 * here is a rule doing its job, and the message must be shown as-is.
 */
export const remindParty = (id) =>
  apiFetch(`/ledger/parties/${id}/remind`, { method: 'POST' });

// ─── Entries ────────────────────────────────────────────────────────────────

/**
 * দিলাম / পেলাম / বিক্রি / খরচ.
 *
 * `kind` carries the direction; `amount` is always positive. A negative amount
 * can never quietly invert an entry's meaning.
 */
export const createEntry = (payload) =>
  apiFetch('/ledger/entries', { method: 'POST', body: payload });

/** Crossed out, never erased — the reason stays on the line. */
export const voidEntry = (id, reason) =>
  apiFetch(`/ledger/entries/${id}/void`, { method: 'POST', body: { reason } });

/** The daily cash page. `cashOnly` drops the credit lines. */
export const listEntries = ({ dayKey = '', kind = '', cashOnly = false } = {}) => {
  const qs = new URLSearchParams();
  if (dayKey) qs.set('dayKey', dayKey);
  if (kind) qs.set('kind', kind);
  if (cashOnly) qs.set('cashOnly', '1');
  const s = qs.toString();
  return apiFetch(`/ledger/entries${s ? `?${s}` : ''}`);
};
