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

/**
 * Shop-wide switches. Today: the kill for automated reminders.
 *
 * NOT a consent gate — consent is per customer and defaults off. This is the
 * one tap that stops everything when a customer complains, without unpicking
 * each page he switched on.
 */
export const updateKhataSettings = (payload) =>
  apiFetch('/ledger/settings', { method: 'PATCH', body: payload });

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
 * The statement: opening balance, every line with the balance AFTER it, and
 * the closing balance. `from`/`to` are 'YYYY-MM-DD'; omit them for this month.
 *
 * Deliberately NOT computed on the phone, and deliberately not merged with the
 * offline queue. This is the page he turns around to show the customer, and a
 * running total the phone worked out for itself disagrees with the server's
 * the moment either side has an entry the other has not seen. In a shop, a
 * disagreement in front of a customer is an argument — so this view shows only
 * what has actually reached the book, and says so when something is still
 * waiting to sync.
 */
export const getPartyStatement = (id, { from = '', to = '' } = {}) => {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const s = qs.toString();
  return apiFetch(`/ledger/parties/${id}/statement${s ? `?${s}` : ''}`);
};

/**
 * WhatsApp the statement to the customer.
 *
 * The message is composed ENTIRELY on the server, from the same arithmetic the
 * screen uses, and rewritten from the customer's side of the counter — "বাকি"
 * and "জমা" rather than "দিলাম" and "পেলাম", and "আপনার বাকি" rather than
 * "আপনি পাবেন". Building it here instead would mean two versions of the
 * running total and two chances to invert the perspective.
 *
 * Refusals are RULES, not glitches: no consent on file, no phone number, or
 * already sent today. Show the server's message as it comes.
 */
export const sendStatement = (id, { from = '', to = '' } = {}) =>
  apiFetch(`/ledger/parties/${id}/statement/send`, {
    method: 'POST',
    body: { from, to },
  });

/**
 * The period page — totals, cash position and what the book is owed, over any
 * date range rather than only today.
 *
 * `netCash` is cash, NOT profit: this book has no cost of goods in it. দিলাম is
 * kept out of the cash line entirely and reported under `receivable`, because
 * counting goods-on-credit as income is the quickest way to believe there is
 * money in the tin that is not.
 */
export const getReport = ({ from = '', to = '' } = {}) => {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const s = qs.toString();
  return apiFetch(`/ledger/report${s ? `?${s}` : ''}`);
};

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
