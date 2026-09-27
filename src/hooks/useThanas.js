import { useEffect, useState } from 'react';
import { getThanas } from '../services/geoService.js';

/**
 * useThanas — the coverage picker's list, fetched once per session.
 * ──────────────────────────────────────────────────────────────────────────
 * Deliberately the same shape as useCategories: a module-level cache and a
 * shared in-flight promise, so the registration wizard and the profile editor
 * mounting together make ONE request rather than two.
 *
 * Kept out of the bundle on purpose — see services/geoService.js for why.
 */

let cache = null;
let inFlight = null;

function load() {
  if (cache) return Promise.resolve(cache);
  if (!inFlight) {
    inFlight = getThanas()
      .then((data) => {
        cache = data.thanas || [];
        return cache;
      })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

/** Forget the list — for a retry after a failed load. */
export function invalidateThanas() {
  cache = null;
}

export function useThanas() {
  const [thanas, setThanas] = useState(cache || []);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (cache) return undefined;
    let cancelled = false;

    setLoading(true);
    load()
      .then((list) => { if (!cancelled) { setThanas(list); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  return {
    thanas,
    loading,
    error,
    retry: () => {
      invalidateThanas();
      setLoading(true);
      setError(null);
      load()
        .then(setThanas)
        .catch(setError)
        .finally(() => setLoading(false));
    },
  };
}

export default useThanas;
