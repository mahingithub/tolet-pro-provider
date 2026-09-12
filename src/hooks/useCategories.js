import { useEffect, useState } from 'react';
import { getCategories } from '../services/providerService.js';

/**
 * useCategories — the category registry, fetched once per session.
 * ──────────────────────────────────────────────────────────────────────────
 * The registry is config/serviceCategories.js served over the wire. It is
 * never bundled into this app: the same definition drives the registration
 * form, the price editor AND server-side validation, and a copy baked in here
 * would fork it the first time a category changes.
 *
 * Cached in module scope rather than in a context. The response is static for
 * the life of a deploy and the server already serves it with a long ETag, so
 * the only thing worth avoiding is a second round-trip when the wizard moves
 * from step 2 to step 6 — a module-level promise does that in four lines.
 *
 * The in-flight promise is shared, so a wizard step and the price editor
 * mounting together make ONE request rather than two.
 */

let cache = null;
let inFlight = null;

function load() {
  if (cache) return Promise.resolve(cache);
  if (!inFlight) {
    inFlight = getCategories()
      .then((data) => {
        cache = data;
        return data;
      })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

/** Forget the cached registry — for a pull-to-refresh or after a failure. */
export function invalidateCategories() {
  cache = null;
}

export function useCategories() {
  const [data, setData] = useState(cache);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (cache) return undefined;
    let cancelled = false;

    setLoading(true);
    load()
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const categories = data?.categories || [];
  return {
    categories,
    meta: data?.meta || null,
    byId: (id) => categories.find((c) => c.id === id) || null,
    loading,
    error,
    retry: () => { invalidateCategories(); setData(null); setLoading(true); load().then(setData).catch(setError).finally(() => setLoading(false)); },
  };
}
