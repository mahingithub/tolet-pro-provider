import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

import { useLang, toBnDigits } from '../context/LanguageContext.jsx';
import { forgotPassword, resetPassword } from '../services/authService.js';
import { toE164, looksLikeBdMobile } from '../utils/phone.js';
import { Button, Card, Field, inputClass } from '../components/ui/index.js';

/**
 * Forgot password.
 * ──────────────────────────────────────────────────────────────────────────
 * Two steps, because the only thing a shopkeeper who has lost his password
 * still has is the phone:
 *
 *   1. the number      → POST /forgot-password   (sends the OTP)
 *   2. code + new one  → POST /reset-password    (and signs every device out)
 *
 * ─── THE NUMBER IS SHOWN BACK, NOT HIDDEN ────────────────────────────────────
 * Step 2 names the number the code went to and offers to change it. That is
 * not decoration. The server answers step 1 identically whether or not the
 * number has an account — it must, or this form becomes a way to ask "is this
 * shopkeeper registered?" about any number in the country — so a typo produces
 * a screen that waits forever for an SMS that was never sent. Showing the
 * number is the only way the person can spot that themselves, and it is why
 * this step is not a dead end.
 *
 * ─── NO SESSION AT THE END ───────────────────────────────────────────────────
 * A successful reset lands on /login, not inside the app. The reset clears
 * every session on the account, which is the point of it; logging straight
 * back in also proves the new password is the one he thinks he typed, on a
 * form with no confirm field.
 */

const RESEND_COOLDOWN_S = 60;

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const { t, bn } = useLang();

  const [stage, setStage] = useState('phone'); // 'phone' | 'reset'
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // The number the code actually went to, in E.164. Held apart from the input
  // so that editing the field on step 2 can never reset a different account
  // than the one that was messaged.
  const sentToRef = useRef('');

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const num = (v) => (bn ? toBnDigits(v) : v);

  const sendCode = async (e) => {
    e?.preventDefault();
    const e164 = toE164(phone);
    setBusy(true);
    try {
      await forgotPassword({ phone: e164 });
      sentToRef.current = e164;
      setStage('reset');
      setCooldown(RESEND_COOLDOWN_S);
      // Carefully worded. The server did not tell us an account exists, so
      // neither does this — "যদি অ্যাকাউন্ট থাকে" is the honest claim.
      toast.success(t('অ্যাকাউন্ট থাকলে কোড পাঠানো হয়েছে', 'If the account exists, a code is on its way'));
    } catch (err) {
      toast.error(err.message || t('কোড পাঠানো গেল না', 'Could not send the code'));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    try {
      await forgotPassword({ phone: sentToRef.current });
      setCooldown(RESEND_COOLDOWN_S);
      toast.success(t('আবার কোড পাঠানো হয়েছে', 'Code sent again'));
    } catch (err) {
      toast.error(err.message || t('কোড পাঠানো গেল না', 'Could not send the code'));
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await resetPassword({ phone: sentToRef.current, otp: otp.trim(), password });
      toast.success(t('পাসওয়ার্ড বদলেছে। এবার লগইন করুন।', 'Password changed. Sign in now.'));
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(err.message || t('পাসওয়ার্ড বদলানো গেল না', 'Could not change the password'));
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
            {t('পাসওয়ার্ড ভুলে গেছেন?', 'Forgot your password?')}
          </h1>
          <p className="text-sm text-gray-600 mt-1.5">
            {stage === 'phone'
              ? t('আপনার নম্বরে একটি কোড পাঠানো হবে', 'We will send a code to your number')
              : t('কোডটি লিখে নতুন পাসওয়ার্ড দিন', 'Enter the code and choose a new password')}
          </p>
        </div>

        {stage === 'phone' ? (
          <>
            <Card className="space-y-4" padded={false}>
              <form onSubmit={sendCode} className="p-5 space-y-4">
                <Field label={t('মোবাইল নম্বর', 'Mobile number')} htmlFor="phone" required>
                  <input
                    id="phone"
                    autoFocus
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

                <Button
                  type="submit" variant="primary" size="lg" fullWidth
                  loading={busy} disabled={!looksLikeBdMobile(phone)}
                >
                  {t('কোড পাঠান', 'Send code')}
                </Button>
              </form>
            </Card>

            <p className="text-center text-sm text-gray-600">
              <button
                type="button"
                className="font-bold text-[#ba0036] underline underline-offset-2"
                onClick={() => navigate('/login')}
              >
                {t('লগইনে ফিরে যান', 'Back to sign in')}
              </button>
            </p>
          </>
        ) : (
          <>
            <Card className="space-y-4" padded={false}>
              <form onSubmit={submitReset} className="p-5 space-y-4">
                {/* The number, in plain sight. See the header comment. */}
                <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
                  <p className="text-xs font-bold text-gray-500">
                    {t('কোড পাঠানো হয়েছে', 'Code sent to')}
                  </p>
                  <p className="text-base font-bold text-gray-900 mt-0.5" dir="ltr">
                    {num(sentToRef.current)}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setStage('phone'); setOtp(''); setPassword(''); }}
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-[#ba0036] mt-1.5"
                  >
                    <ArrowLeft size={15} />
                    {t('নম্বর ভুল? বদলান', 'Wrong number? Change it')}
                  </button>
                </div>

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
                    onChange={(ev) => setOtp(ev.target.value.replace(/\D/g, ''))}
                    required
                  />
                </Field>

                <Field
                  label={t('নতুন পাসওয়ার্ড', 'New password')}
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
                  loading={busy} disabled={otp.length !== 6 || password.length < 8}
                >
                  {t('পাসওয়ার্ড বদলান', 'Change password')}
                </Button>
              </form>
            </Card>

            {/* Says what the reset costs, before it happens. A shopkeeper whose
                other phone silently signed out would read that as the app
                breaking, not as the reset working. */}
            <p className="text-xs text-gray-500 text-center leading-relaxed px-2">
              {t('পাসওয়ার্ড বদলালে সব ডিভাইস থেকে লগআউট হয়ে যাবে।',
                 'Changing the password signs you out on every device.')}
            </p>

            <div className="text-center">
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
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
