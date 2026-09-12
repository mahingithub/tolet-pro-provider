import { useCallback, useEffect, useState } from 'react';

import { createEntry } from '../services/ledgerService.js';
import { flush, pendingCount, onQueueChanged } from '../services/ledgerQueue.js';

/**
 * useLedgerSync — one drain policy, used by every খাতা screen.
 * ──────────────────────────────────────────────────────────────────────────
 * This lived inline in the খাতা front page first, and the party page had only
 * a drain-on-mount. The result was a real hole: a shopkeeper writes an entry
 * with no signal, STAYS on that person's page (which is exactly what he does —
 * he is still serving the customer), the signal comes back, and nothing syncs
 * until he happens to navigate away and return.
 *
 * A sync policy that only half the screens implement is not a policy. So it
 * lives here, and both screens call it.
 *
 * Three triggers, deliberately overlapping:
 *   • on mount — catches whatever was left from the last session
 *   • the `online` event — the fast path when it fires
 *   • a 30-second poll — because Android WebViews fire `online` unreliably,
 *     and a queue that drains only on a signal we might never get is a queue
 *     that quietly never drains
 *
 * @param {() => void} [onSynced] called after entries actually reached the
 *        server, so the caller can refetch the authoritative totals.
 */
export function useLedgerSync(onSynced) {
  const [pending, setPending] = useState(pendingCount);
  const [failed, setFailed] = useState(0);

  const drain = useCallback(async () => {
    const res = await flush(createEntry);
    setPending(pendingCount());
    if (res.failed) setFailed((n) => n + res.failed);
    // Only refetch when something actually moved. Reloading on every tick
    // would burn data on a connection that is already the problem.
    if (res.sent && onSynced) onSynced();
    return res;
  }, [onSynced]);

  // Keep the badge honest even when another screen queued the entry.
  useEffect(() => onQueueChanged(() => setPending(pendingCount())), []);

  useEffect(() => {
    drain();
    const onOnline = () => { drain(); };
    window.addEventListener('online', onOnline);
    const timer = setInterval(drain, 30_000);
    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
  }, [drain]);

  return { pending, failed, drain };
}

export default useLedgerSync;
