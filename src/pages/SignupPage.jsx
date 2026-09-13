import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

import { useProviderAuth } from '../context/ProviderAuthContext.jsx';
import { useLang, toBnDigits } from '../context/LanguageContext.jsx';
import { startSignup, verifySignup } from '../services/authService.js';
import { toE164, looksLikeBdMobile } from '../utils/phone.js';
import { Button, Card, Field, inputClass } from '../components/ui/index.js';

/**
 * Register — a MERCHANT account, created here and nowhere else.
 * ──────────────────────────────────────────────────────────────────────────
 * A shopkeeper is not a To-Let Pro user. This app signs in against its own
 * identity collection at `/api/merchant/auth/*` with its own token audience
 * (see services/authService.js and the backend's merchantAuth.service.js), so
 * a rental account is neither required nor usable here — someone holding one
 * still has to register, and the same number legitimately exists on both sides
 * as two separate accounts.
 *
 * This screen existed only on the server for a while: `startSignup` and
 * `verifySignup` were written and routed, but nothing in the app called them
 * and the "নতুন? রেজিস্ট্রেশন করুন" link pointed at /onboarding — which is
 * guarded, so it bounced straight back to "প্রথমে অ্যাকাউন্ট লাগবে. লগইন
 * করুন". There was no way to create an account at all, and the copy told
 * people to sign in with a rental account that this surface would reject.
 *
 * Two steps, because the phone number has to be proved:
 *
 *   1. name + number + password   → POST /signup/start   (sends the OTP)
 *   2. the six-digit code         → POST /signup/verify  (opens the session)
 *
 * Then straight into /onboarding. A fresh account owns no business, which is a
 * perfectly valid state and exactly what that wizard is for.
 */

// Long enough that a slow SMS route doesn't get hammered, short enough that
// someone whose code genuinely never arrived isn't left staring at a dead
// button. The code itself lives for 5 minutes (OTP_TTL_MIN, server-side).
const RESEND_COOLDOWN_S = 60;

const SignupPage = () => {
  const navigate = useNavigate();
  const { setUser, refreshProviders } = useProviderAuth();
  const { t, bn } = useLang();

  const [stage, setStage] = useState('details'); // 'details' | 'otp'
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // The number the OTP was actually sent to, in E.164. Kept separately from
  // the input so that editing the field after the code has gone out can never
  // verify against a different number than the one that was messaged.
  const sentToRef = useRef('');

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const num = (v) => (bn ? toBnDigits(v) : v);

  /** Step 1 — create the unverified merchant and send the code. */
  const sendCode = async (e) => {
    e?.preventDefault();
    const e164 = toE164(phone);
    setBusy(true);
    try {
      await startSignup({ name: name.trim(), phone: e164, password });
      sentToRef.current = e164;
      setStage('otp');
      setCooldown(RESEND_COOLDOWN_S);
      toast.success(t('কোড পাঠানো হয়েছে', 'Code sent'));
    } catch (err) {
      // The server's message for this one already says "লগইন করুন", so send
      // them there rather than leaving them to re-read it on a form they can
      // never submit.
      if (err.code === 'already_registered') {
        toast.error(err.message);
        navigate('/login');
        return;
      }
      toast.error(err.message || t('রেজিস্ট্রেশন শুরু করা গেল না', 'Could not start registration'));
    } finally {
      setBusy(false);
    }
  };

  /** Step 1 again — same call, same payload. The server overwrites the row. */
  const resend = async () => {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    try {
      await startSignup({ name: name.trim(), phone: sentToRef.current, password });
      setCooldown(RESEND_COOLDOWN_S);
      toast.success(t('আবার কোড পাঠানো হয়েছে', 'Code sent again'));
    } catch (err) {
      toast.error(err.message || t('কোড পাঠানো গেল না', 'Could not send the code'));
    } finally {
      setBusy(false);
    }
  };

  /** Step 2 — confirm the code, which is what opens the session. */
  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const merchant = await verifySignup({ phone: sentToRef.current, otp: otp.trim() });
      setUser(merchant);
      await refreshProviders();
      // A brand-new account owns nothing, so there is no order list to land on.
      navigate('/onboarding', { replace: true });
    } catch (err) {
      toast.error(err.message || t('কোড মেলেনি', 'That code did not match'));
    } finally {
      setBusy(false);
    }
  };

  const canSend = name.trim().length >= 2 && looksLikeBdMobile(phone) && password.length >= 8;

  return (
    <div className="min-h-screen bg-[#f4f6f8] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[#ba0036]">TO-LET PRO SERVICES</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">
            {stage === 'details'
              ? t('রেজিস্ট্রেশন', 'Register')
              : t('নম্বর যাচাই', 'Verify your number')}
          </h1>
          <p className="text-sm text-gray-600 mt-1.5">
            {stage === 'details'
              ? t('সেবা প্রদানকারী হিসেবে নতুন অ্যাকাউন্ট খুলুন', 'Open a new provider account')
              : t('আপনার নম্বরে পাঠানো ৬ সংখ্যার কোডটি লিখুন', 'Enter the 6-digit code we sent you')}
          </p>
        </div>

        {stage === 'details' ? (
          <>
            <Card className="space-y-4" padded={false}>
              <form onSubmit={sendCode} className="p-5 space-y-4">
                <Field label={t('আপনার নাম', 'Your name')} htmlFor="name" required>
                  <input
                    id="name"
                    autoFocus
                    autoComplete="name"
                    className={inputClass}
                    value={name}
                    onChange={(ev) => setName(ev.target.value)}
                    required
                  />
                </Field>

                <Field label={t('মোবাইল নম্বর', 'Mobile number')} htmlFor="phone" required>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    className={inputClass}
                    placeholder="01XXXXXXXXX"
                    value={phone}
                    onChange={(ev) => setPhone(ev.target.value)}
                    required
                  />
                </Field>

                <Field
                  label={t('পাসওয়ার্ড', 'Password')}
                  htmlFor="password"
                  hint={t('অন্তত ৮ অক্ষর', 'At least 8 characters')}
                  required
                >
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      className={`${inputClass} pr-12`}
                      value={password}
                      onChange={(ev) => setPassword(ev.target.value)}
                      required
                    />
                    {/* A password typed once, on a phone, with no confirm field:
                        being able to read it back is the difference between
                        getting in tomorrow and being locked out of an account
                        that has no reset flow yet. */}
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 rounded-xl flex items-center justify-center text-gray-500"
                      aria-label={showPassword ? t('লুকান', 'Hide') : t('দেখুন', 'Show')}
                    >
                      {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                    </button>
                  </div>
                </Field>

                <Button
                  type="submit" variant="primary" size="lg" fullWidth
                  loading={busy} disabled={!canSend}
                >
                  {t('কোড পাঠান', 'Send code')}
                </Button>
              </form>
            </Card>

            {/* Says plainly that the rental account is a different account.
                Without this, someone who already uses To-Let Pro tries their
                existing number and password, gets "এই নম্বরে কোনো অ্যাকাউন্ট
                নেই", and concludes the app is broken. */}
            <p className="text-xs text-gray-500 text-center leading-relaxed px-2">
              {t('সেবা প্রদানকারীর অ্যাকাউন্ট আলাদা। To-Let Pro-তে বাসা ভাড়ার অ্যাকাউন্ট থাকলেও এখানে নতুন করে রেজিস্ট্রেশন করতে হবে — একই নম্বর ব্যবহার করতে পারবেন।',
                 'A provider account is separate. Even if you have a To-Let Pro rental account, you register again here — the same number is fine.')}
            </p>

            <p className="text-center text-sm text-gray-600">
              {t('আগেই অ্যাকাউন্ট আছে? ', 'Already registered? ')}
              <button
                type="button"
                className="font-bold text-[#ba0036] underline underline-offset-2"
                onClick={() => navigate('/login')}
              >
                {t('লগইন করুন', 'Sign in')}
              </button>
            </p>
          </>
        ) : (
          <>
            <Card className="space-y-4" padded={false}>
              <form onSubmit={verify} className="p-5 space-y-4">
                <Field label={t('কোড', 'Code')} htmlFor="otp" required>
                  <input
                    id="otp"
                    autoFocus
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className={`${inputClass} text-center text-2xl font-bold tracking-[0.4em]`}
                    placeholder="------"
                    value={otp}
                    // Digits only: a pasted code often arrives with spaces
                    // around it, and the server compares the string exactly.
                    onChange={(ev) => setOtp(ev.target.value.replace(/\D/g, ''))}
                    required
                  />
                </Field>

                <Button
                  type="submit" variant="primary" size="lg" fullWidth
                  loading={busy} disabled={otp.length !== 6}
                >
                  {t('যাচাই করুন', 'Verify')}
                </Button>
              </form>
            </Card>

            <div className="text-center space-y-3">
              <button
                type="button"
                onClick={resend}
                disabled={cooldown > 0 || busy}
                className="text-sm font-bold text-[#ba0036] disabled:text-gray-400 disabled:font-semibold"
              >
                {cooldown > 0
                  ? t(`আবার পাঠান (${num(cooldown)})`, `Resend (${cooldown})`)
                  : t('আবার কোড পাঠান', 'Resend code')}
              </button>

              <div>
                <button
                  type="button"
                  onClick={() => { setStage('details'); setOtp(''); }}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-600"
                >
                  <ArrowLeft size={16} />
                  {t('নম্বর বদলান', 'Change number')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SignupPage;
