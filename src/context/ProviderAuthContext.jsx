import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo,
} from 'react';

import {
  getToken, getUser, clearSession, onSessionCleared,
  getActiveProviderId, setActiveProviderId,
} from '../services/session.js';
import { fetchMe, logout as apiLogout } from '../services/authService.js';
import { listMyProviders } from '../services/providerService.js';
import { clearQueue } from '../services/ledgerQueue.js';

/**
 * ProviderAuthContext — who is signed in, and which business they are running.
 * ──────────────────────────────────────────────────────────────────────────
 * Two separate questions, deliberately answered in one place:
 *
 *   1. WHO   — a MERCHANT, an account in this system alone. Not a To-Let Pro
 *              user, and carrying no rental role of any kind.
 *   2. WHICH — the Provider (business) currently selected
 *
 * They are separate because one account may own more than one business (the
 * man with a মুদি দোকান and a gas agency), and because the account can be
 * perfectly valid while owning no business at all — which is exactly the state
 * a brand-new signup is in, and is what routes them into onboarding rather
 * than into an empty order list.
 */

const AuthContext = createContext(null);

export function ProviderAuthProvider({ children }) {
  const [user, setUser] = useState(() => getUser());
  const [providers, setProviders] = useState([]);
  const [activeId, setActiveId] = useState(() => getActiveProviderId());
  // `booting` covers the first server round-trip. Without it a valid session
  // flashes the login screen on every reload, which reads as being logged out.
  const [booting, setBooting] = useState(() => Boolean(getToken()));
  const [loadingProviders, setLoadingProviders] = useState(false);

  /** Re-read the businesses this account owns. */
  const refreshProviders = useCallback(async () => {
    setLoadingProviders(true);
    try {
      const data = await listMyProviders();
      const list = data.providers || [];
      setProviders(list);

      // Keep the selection valid: if the stored id is gone (deleted, or a
      // different account signed in), fall back to the first business rather
      // than leaving every screen pointed at nothing.
      setActiveId((current) => {
        const stillThere = list.some((p) => p.id === current);
        const next = stillThere ? current : (list[0]?.id || null);
        setActiveProviderId(next);
        return next;
      });
      return list;
    } catch {
      // A failed list must not look like "you have no business" — that would
      // push an established provider into onboarding over a dropped request.
      return null;
    } finally {
      setLoadingProviders(false);
    }
  }, []);

  // Boot: confirm the stored token against the server before trusting it.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!getToken()) { setBooting(false); return; }
      try {
        const me = await fetchMe();
        if (cancelled) return;
        setUser(me);
        // Every signed-in merchant gets the lookup; there is no role to gate
        // on, and the endpoint simply returns [] for someone who owns nothing.
        await refreshProviders();
      } catch {
        // apiClient has already ended the session if the server said it was
        // over. Anything else — a 5xx, a flaky connection — leaves the cached
        // user in place so the app still opens on a bad network.
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => { cancelled = true; };
  }, [refreshProviders]);

  // apiClient ends the session on a terminal failure; this is how the UI hears
  // about it from anywhere in the app, not just from a /me probe.
  useEffect(() => onSessionCleared(() => {
    setUser(null);
    setProviders([]);
    setActiveId(null);
  }), []);

  const selectProvider = useCallback((id) => {
    setActiveId(id);
    setActiveProviderId(id);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    // Unsynced ledger ops belong to the merchant who wrote them. Leaving them
    // behind would sync one shopkeeper's entries into the next one's book on a
    // shared phone.
    clearQueue();
    setUser(null);
    setProviders([]);
    setActiveId(null);
  }, []);

  const value = useMemo(() => {
    const activeProvider = providers.find((p) => p.id === activeId) || null;
    return {
      user,
      setUser,
      isAuthed: Boolean(user),
      booting,

      providers,
      activeProvider,
      activeId,
      selectProvider,
      refreshProviders,
      loadingProviders,

      // A signed-in account with no business yet. The router uses this to send
      // them to onboarding instead of to an order list that can never fill.
      needsOnboarding: Boolean(user) && !booting && !loadingProviders && providers.length === 0,

      logout,
      clearSession,
    };
  }, [
    user, booting, providers, activeId, selectProvider,
    refreshProviders, loadingProviders, logout,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useProviderAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useProviderAuth must be used inside <ProviderAuthProvider>');
  return ctx;
}
