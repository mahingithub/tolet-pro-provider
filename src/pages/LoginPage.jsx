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
 * Phone + password against the ORDINARY user auth surface, because a provider
 * is a User with the `provider` role rather than a separate account type.
 *
 * The consequence worth being careful about: a tenant or landlord who already
 * has a To-Let Pro account signs in here with the SAME credentials and simply
 * gains the role. Nobody is ever asked to create a second account — a
 * shopkeeper told to "register" when he already has an account will make a
 * duplicate under a different number and then lose access to both.
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
    session_expired: t('আপনার সেশন শেষ হয়েছে। আবার লগইন করুন।', 'Your session expired. Please sign in again.'),
    account_banned:  t('আপনার অ্যাকাউন্ট বন্ধ করা হয়েছে।', 'Your account has been suspended.'),
    access_revoked:  t('আপনার অ্যাক্সেস বাতিল করা হয়েছে।', 'Your access was revoked.'),
  }[endedReason];

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      // The API wants strict E.164; a shopkeeper types 01711111111. Normalise
      // here rather than making him learn a format to sign in.
      const me = await login({ phone: toE164(phone), password });
      // No role call here. `provider` is NOT in the server's self-serve role
      // set (auth.controller.additions.js → SELF_SERVE), so asking for it 403s
      // — and an earlier version of this screen let that 403 escape, leaving
      // someone stuck on the login form with a perfectly valid session.
      //
      // The role is granted server-side the moment a business is created
      // (provider.controller.js → create), which is the only point it means
      // anything. Nothing in this app gates on it: RequireProvider checks that
      // you are signed in and whether you own a business, not what roles you
      // hold.
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
          <p className="text-xs font-bold uppercase tracking-widest text-[#ba0036]">TO-LET PRO</p>
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
          </form>
        </Card>

        <p className="text-center text-sm text-gray-600">
          {t('নতুন? ', 'New here? ')}
          <button
            type="button"
            className="font-bold text-[#ba0036] underline underline-offset-2"
            onClick={() => navigate('/onboarding')}
          >
            {t('রেজিস্ট্রেশন করুন', 'Register')}
          </button>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
