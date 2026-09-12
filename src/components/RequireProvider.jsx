import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useProviderAuth } from '../context/ProviderAuthContext.jsx';
import LoadingState from './common/LoadingState.jsx';

/**
 * Route guard for the whole provider shell. Three gates, in order:
 *
 *   1. booting            → spinner, so a valid session never flashes /login
 *   2. not signed in      → /login carrying a `next` param
 *   3. no business yet    → /onboarding
 *
 * The third one matters: a freshly signed-up account is perfectly valid and
 * owns nothing, and dropping that person onto an order list that can never
 * fill is how a registration gets abandoned thirty seconds after it started.
 *
 * This is defence-in-depth on the client only. The backend independently
 * enforces ownership on every /api/providers request — a guard in the browser
 * protects the experience, never the data.
 */
const RequireProvider = ({ children }) => {
  const { isAuthed, booting, needsOnboarding, loadingProviders } = useProviderAuth();
  const location = useLocation();

  if (booting || loadingProviders) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f6f8]">
        <LoadingState label="এক মুহূর্ত…" />
      </div>
    );
  }

  if (!isAuthed) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
};

export default RequireProvider;
