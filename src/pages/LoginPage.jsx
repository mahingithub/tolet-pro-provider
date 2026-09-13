import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { useProviderAuth } from '../context/ProviderAuthContext.jsx';
import { useLang } from '../context/LanguageContext.jsx';
import { login } from '../services/authService.js';
import { getSessionEndedReason, clearSessionEndedReason } from '../services/session.js';
import { toE164 } from '../utils/phone.js';
import { Button, Card, Field, inputClass } from '../components/ui/index.js';

/**
 * Sign in.
 * ──────────────────────────────────────────────────────────────────────────
 * Phone + password against the MERCHANT auth surface (`/api/merchant/auth/*`),
 * which is a separate identity collection with its own token audience — not
 * the rental app's /api/auth.
 *
 * This comment used to describe the opposite: a provider as a User carrying a
 * `provider` role, signing in with an existing To-Let Pro account. That model
 * is gone (see services/authService.js), and the copy it left behind was worse
 * than merely stale — it told people with a rental account that they did not
 * need to register, when in fact their rental credentials are rejected here
 * and registering is the only way in.
 *
 * A landlord who also runs the shop downstairs therefore holds two accounts on
 * the same number, which is intended: one password each, one session each.
 *
 * No onboarding carousel, no marketing above the fold. Two fields and a button.
 */
const LoginPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setUser, refreshProviders } = useProviderAuth();
  const { t } = useLang();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // Read once, non-destructively — StrictMode runs initializers twice in dev,
  // and a read-and-delete would swallow the message on the second pass.
  const [endedReason] = useState(() => getSessionEndedReason());

  useEffect(() => { clearSessionEndedReason(); }, []);

  const endedMessage = {
    session_expired:  t('আপনার সেশন শেষ হয়েছে। আবার লগইন করুন।', 'Your session expired. Please sign in again.'),
    account_banned:   t('আপনার অ্যাকাউন্ট বন্ধ করা হয়েছে।', 'Your account has been suspended.'),
    access_revoked:   t('আপনার অ্যাক্সেস বাতিল করা হয়েছে।', 'Your access was revoked.'),
    password_changed: t('পাসওয়ার্ড বদলানো হয়েছে। নতুন পাসওয়ার্ড দিয়ে লগইন করুন।',
                        'The password was changed. Sign in with the new one.'),
  }[endedReason];

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      // The API wants strict E.164; a shopkeeper types 01711111111. Normalise
      // here rather than making him learn a format to sign in.
      const me = await login({ phone: toE164(phone), password });
      // No role call here, and there is no role to ask for: a Merchant has no
      // roles at all. Everyone in this collection is a provider by virtue of
      // being in it, and RequireProvider gates on being signed in and owning a
      // business — never on a role.
      setUser(me);
      await refreshProviders();
      navigate(params.get('next') || '/', { replace: true });
    } catch (err) {
      toast.error(err.message || t('লগইন করা গেল না', 'Could not sign in'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6f8] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[#ba0036]">TO-LET PRO SERVICES</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">
            {t('সেবা প্রদানকারী', 'Provider')}
          </h1>
          <p className="text-sm text-gray-600 mt-1.5">
            {t('আপনার দোকান বা সেবা অনলাইনে আনুন', 'Bring your shop or service online')}
          </p>
        </div>

        {endedMessage ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm font-semibold text-amber-900">
            {endedMessage}
          </div>
        ) : null}

        <Card className="space-y-4" padded={false}>
          <form onSubmit={submit} className="p-5 space-y-4">
            <Field label={t('মোবাইল নম্বর', 'Mobile number')} htmlFor="phone" required>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                className={inputClass}
                placeholder="01XXXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </Field>

            <Field label={t('পাসওয়ার্ড', 'Password')} htmlFor="password" required>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>

            <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
              {t('লগইন করুন', 'Sign in')}
            </Button>

            {/* Under the button, not beside the password field. Someone who
                has just been told "পাসওয়ার্ড সঠিক নয়" is looking at the
                bottom of the form, and there is no email on this account —
                this link is the only way back into it. */}
            <button
              type="button"
              className="block w-full text-center text-sm font-bold text-[#ba0036] py-1"
              onClick={() => navigate('/forgot-password')}
            >
              {t('পাসওয়ার্ড ভুলে গেছেন?', 'Forgot your password?')}
            </button>
          </form>
        </Card>

        <p className="text-center text-sm text-gray-600">
          {t('নতুন? ', 'New here? ')}
          <button
            type="button"
            className="font-bold text-[#ba0036] underline underline-offset-2"
            onClick={() => navigate('/signup')}
          >
            {t('রেজিস্ট্রেশন করুন', 'Register')}
          </button>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
