/**
 * ledgerQueue.js — write the entry now, sync it when there's signal.
 * ──────────────────────────────────────────────────────────────────────────
 * A shopkeeper writes in his খাতা while a customer is standing there. He does
 * not wait for a spinner and he does not care whether the phone has signal —
 * on paper it always worked. If this feature ever makes him wait, he keeps the
 * paper book, and then he keeps it forever.
 *
 * So an entry is committed LOCALLY and sent afterwards:
 *
 *   1. the op is appended to a persisted log (localStorage, survives the app
 *      being closed or killed mid-sale)
 *   2. the UI updates immediately from that log
 *   3. a flush drains it whenever the network comes back
 *   4. `clientEntryId` makes a replay a no-op server-side
 *
 * ─── WHY THE ID IS GENERATED BEFORE THE FIRST ATTEMPT ────────────────────────
 * Not on retry — BEFORE the first send. A request that reaches the server and
 * whose response is lost is indistinguishable, from here, from one that never
 * arrived. Only an id minted before the first attempt makes the retry
 * recognisable as the same entry, and that is exactly the case that would
 * otherwise double somebody's debt.
 *
 * ─── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────
 * There is no conflict resolution, because there are no conflicts: entries are
 * append-only and a void is its own op. Nothing here edits anything.
 */

const KEY = 'toletpro_provider:ledger-queue';
const EVT = 'toletpro-provider:ledger-queue-changed';

/** Read the op log. Corrupt storage is dropped rather than crashing the app. */
export function readQueue() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeQueue(list) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Quota or private mode. The op is lost, which is bad — but throwing here
    // would lose the entry AND break the screen he is standing in front of.
  }
  try { window.dispatchEvent(new CustomEvent(EVT)); } catch { /* ignore */ }
}

export const onQueueChanged = (handler) => {
  window.addEventListener(EVT, handler);
  return () => window.removeEventListener(EVT, handler);
};

/**
 * Append an op and return it. The caller renders from the queue immediately —
 * it does NOT wait for `flush()`.
 */
export function enqueue(op) {
  // Never call this from inside a setState updater: React may invoke an
  // updater twice in StrictMode/concurrent rendering, and the op log would get
  // the same entry appended twice with two different ids — two debts.
  const list = readQueue();
  const entry = { ...op, queuedAt: Date.now(), attempts: 0, error: null };
  list.push(entry);
  writeQueue(list);
  return entry;
}

function removeOp(clientEntryId) {
  writeQueue(readQueue().filter((o) => o.clientEntryId !== clientEntryId));
}

function markFailed(clientEntryId, message) {
  writeQueue(readQueue().map((o) => (
    o.clientEntryId === clientEntryId
      ? { ...o, attempts: (o.attempts || 0) + 1, error: message }
      : o
  )));
}

let flushing = false;

/**
 * Drain the log. Safe to call often — concurrent calls collapse into one, and
 * ops are sent in the order they were written so a page's running total never
 * rebuilds out of sequence.
 *
 * @param {(op) => Promise<any>} send  usually ledgerService.createEntry
 */
export async function flush(send) {
  if (flushing) return { sent: 0, failed: 0 };
  const list = readQueue();
  if (!list.length) return { sent: 0, failed: 0 };

  flushing = true;
  let sent = 0;
  let failed = 0;

  try {
    for (const op of list) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await send(op.payload);
        removeOp(op.clientEntryId);
        sent += 1;
      } catch (err) {
        // A 4xx means the server will never accept this op — retrying forever
        // would wedge the queue and block every entry behind it. Drop it and
        // surface the failure instead.
        //
        // 408/429 are excluded: those ARE retryable and dropping them would
        // silently discard a real entry.
        const permanent = err.status >= 400 && err.status < 500
          && err.status !== 408 && err.status !== 429;

        if (permanent) {
          removeOp(op.clientEntryId);
          failed += 1;
        } else {
          markFailed(op.clientEntryId, err.message || 'sync failed');
          // Stop at the first transient failure. The network is down; hammering
          // the rest of the queue just burns battery and data.
          break;
        }
      }
    }
  } finally {
    flushing = false;
  }

  return { sent, failed };
}

/** How many entries are still waiting — shown as a small "সিঙ্ক বাকি" badge. */
export function pendingCount() {
  return readQueue().length;
}

/** Ops belonging to one party, so its page can render them optimistically. */
export function pendingForParty(partyId) {
  return readQueue().filter((o) => o.payload?.partyId === partyId);
}

/**
 * What the queue adds to a party's balance before the server has seen it.
 * Same rule as the server: credit raises the debt, payment lowers it.
 */
export function pendingBalanceDelta(partyId) {
  return pendingForParty(partyId).reduce((sum, o) => {
    const { kind, amount } = o.payload || {};
    if (kind === 'credit') return sum + Number(amount || 0);
    if (kind === 'payment') return sum - Number(amount || 0);
    return sum;
  }, 0);
}

/** Wipe the log — for a sign-out, so one merchant's ops never sync as another's. */
export function clearQueue() {
  writeQueue([]);
}
