import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';

import { ProviderAuthProvider } from './context/ProviderAuthContext.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import RequireProvider from './components/RequireProvider.jsx';
import ProviderLayout from './components/ProviderLayout.jsx';

import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Orders from './pages/Orders.jsx';
import Listing from './pages/Listing.jsx';
import Khata from './pages/Khata.jsx';
import KhataParty from './pages/KhataParty.jsx';
import Earnings from './pages/Earnings.jsx';
import Reviews from './pages/Reviews.jsx';
import Profile from './pages/Profile.jsx';
import CourierPage from './pages/CourierPage.jsx';

// ─── Why these are NOT React.lazy routes ─────────────────────────────────────
// They were, briefly, and it broke the app. `RequireProvider` redirects a
// business-less account to /onboarding by returning <Navigate> DURING RENDER;
// with a lazy route on the other side that suspends synchronously, React 18
// tears the tree down to the Suspense fallback and logs "a component suspended
// while responding to synchronous input". Tapping a bottom tab does the same
// thing for the same reason.
//
// The weight worth splitting was never the screens — Listing, Earnings and
// Profile are 3-4 kB each — it was LEAFLET, which only the map picker needs.
// So the split lives at that leaf instead (see Onboarding.jsx), where it is
// reached by a step change rather than by a navigation, and the routes stay
// eager and safe.

/**
 * The provider app is served at the ROOT of its own origin, so routes are
 * top-level — no `/provider` prefix.
 *
 * Four tabs behind the guard, and that is the whole app. Adding a fifth should
 * require an argument: the measure here is that a shopkeeper can accept his
 * first order without anyone showing him how, and every extra destination is
 * one more thing between him and that.
 */
function App() {
  return (
    <LanguageProvider>
      <ProviderAuthProvider>
        <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              {/* Creating a MERCHANT account — the only place it happens. This
                  app has its own identity collection, so there is no rental
                  account that can stand in for one. Without this route the
                  "register" link had nowhere to go but /onboarding, which is
                  guarded and bounced people straight back to the login card. */}
              <Route path="/signup" element={<SignupPage />} />
              {/* Password reset, OTP-based. The account has no email, so the
                  phone is the only recovery channel there is. */}
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              {/* Outside the guard on purpose: an account with no business yet is
                  perfectly valid, and this is where it goes. */}
              <Route path="/onboarding" element={<Onboarding />} />

              {/* The COURIER's page. Outside the guard, and it must stay that
                  way: the person opening it is the shop's delivery boy, who has
                  no account here and never will. The token in the URL is the
                  whole credential — see controllers/deliveryTrack.controller.js
                  for why that trade is acceptable. */}
              <Route path="/d/:token" element={<CourierPage />} />

              <Route
                path="/"
                element={(
                  <RequireProvider>
                    <ProviderLayout />
                  </RequireProvider>
                )}
              >
                <Route index element={<Orders />} />
                <Route path="khata" element={<Khata />} />
                <Route path="khata/:id" element={<KhataParty />} />
                <Route path="listing" element={<Listing />} />
                <Route path="earnings" element={<Earnings />} />
                {/* Reached from আয়, NOT a sixth tab. Reviews arrive in ones
                    and twos, not daily like orders or খাতা, and the shell's
                    five-tab rule is worth more than the shortcut. */}
                <Route path="reviews" element={<Reviews />} />
                <Route path="profile" element={<Profile />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>

          {/* Bottom-centre, clear of the tab bar. richColors so a failed accept
              reads as a failure at a glance. */}
          <Toaster position="bottom-center" richColors closeButton offset={90} />
        </BrowserRouter>
      </ProviderAuthProvider>
    </LanguageProvider>
  );
}

export default App;
