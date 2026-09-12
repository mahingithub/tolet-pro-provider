import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { useProviderAuth } from '../context/ProviderAuthContext.jsx';
import { useLang, toBnDigits } from '../context/LanguageContext.jsx';
import { useCategories } from '../hooks/useCategories.js';
import {
  createProvider, updateProvider, updateFields, submitForReview,
} from '../services/providerService.js';
import { uploadImage } from '../services/uploadService.js';
import FieldRenderer, { errorsByKey, serialiseFields } from '../components/fields/FieldRenderer.jsx';
import { iconFor } from '../components/fields/categoryIcons.js';
// Leaflet is ~175 kB and is needed on exactly ONE step of a wizard a provider
// runs through once in his life. Splitting it here — at the leaf, reached by a
// step change rather than by a navigation — keeps it out of the daily download
// without the router/Suspense interaction that made lazy ROUTES unsafe.
const LocationPicker = lazy(() => import('../components/LocationPicker.jsx'));
import { Button, Card, Field, inputClass } from '../components/ui/index.js';
import LoadingState from '../components/common/LoadingState.jsx';
import ErrorState from '../components/common/ErrorState.jsx';

/**
 * Onboarding — registration, in six screens.
 * ──────────────────────────────────────────────────────────────────────────
 * The target is explicit and it is the whole design brief: UNDER 10 TAPS,
 * UNDER 3 MINUTES, and no typing that isn't a name or a number.
 *
 *   category → name → location → coverage → fields → photo + submit
 *
 * Three decisions that carry the whole thing:
 *
 * 1. THE DRAFT SAVES AT EVERY STEP, and resumes where it was left. A
 *    shopkeeper WILL be interrupted by a customer halfway through. Coming back
 *    to step one is where registrations die, so the draft is created the
 *    moment there is enough to create it (name + category + pin) and every
 *    step after that is a PATCH with `?partial=1`.
 *
 * 2. NO NID, NO TRADE LICENCE HERE. Submit asks for basic KYC only — one
 *    photo. Verification is a badge earned later, and demanding an NID at the
 *    door is the wall that stops a গৃহকর্মী registering at all.
 *
 * 3. EVERY LABEL COMES FROM THE CATEGORY. The name question reads "দোকানের
 *    নাম" only for মুদি দোকান and খাবার হোটেল; for everyone else it is
 *    "প্রোভাইডারের নাম", because a গৃহকর্মী or a plumber has no shop and no
 *    signboard. Same for the photo step.
 */

const STEPS = ['category', 'name', 'location', 'coverage', 'fields', 'photo'];

function StepBar({ index, total }) {
  return (
    <div className="flex gap-1.5" aria-label={`Step ${index + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            i <= index ? 'bg-[#ba0036]' : 'bg-gray-200'
          }`}
        />
      ))}
    </div>
  );
}

const Onboarding = () => {
  const navigate = useNavigate();
  const { isAuthed, providers, refreshProviders, booting } = useProviderAuth();
  const { t, bn } = useLang();
  const { categories, loading: catsLoading, error: catsError, retry } = useCategories();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [providerId, setProviderId] = useState(null);
  const [fieldErrs, setFieldErrs] = useState({});
  const [uploadPct, setUploadPct] = useState(null);

  // Local answers. Steps 1-3 are held here until there is enough to create the
  // draft; after that this mirrors what the server already has.
  const [form, setForm] = useState({
    category: '', name: '', lat: null, lng: null,
    coverage: null, fields: {}, photoUrl: '', photoPublicId: '',
  });

  const category = useMemo(
    () => categories.find((c) => c.id === form.category) || null,
    [categories, form.category],
  );

  // ─── Resume an interrupted registration ──────────────────────────────────
  // The single most important behaviour in this screen.
  useEffect(() => {
    if (booting || providerId) return;
    const draft = providers.find((p) => p.status === 'draft' || p.status === 'rejected');
    if (!draft) return;

    setProviderId(draft.id);
    setForm({
      category: draft.category,
      name: draft.name || '',
      lat: draft.lat ?? null,
      lng: draft.lng ?? null,
      coverage: draft.coverage || null,
      fields: draft.fields || {},
      photoUrl: draft.photoUrl || '',
      photoPublicId: draft.photoPublicId || '',
    });
    // Jump to the first thing that is still missing, rather than making
    // someone tap through four screens they already filled in.
    if (!draft.fields || !Object.keys(draft.fields).length) setStep(STEPS.indexOf('fields'));
    else if (!draft.photoUrl) setStep(STEPS.indexOf('photo'));
    else setStep(STEPS.indexOf('photo'));
  }, [providers, booting, providerId]);

  // ─── EVERY HOOK MUST SIT ABOVE THE EARLY RETURNS ─────────────────────────
  // `persist` used to live below them. On a loading render React never reached
  // its useCallback, on a loaded render it did, and the hook count changed
  // between renders — "Rendered more hooks than during the previous render",
  // which crashed this screen to a blank white page. Nothing hook-shaped may
  // move below the guards.
  const patch = (updates) => setForm((f) => ({ ...f, ...updates }));

  /** Create the draft the first time, PATCH it every time after. */
  const persist = useCallback(async (updates) => {
    const next = { ...form, ...updates };

    if (!providerId) {
      const { provider } = await createProvider({
        name: next.name,
        category: next.category,
        lat: next.lat,
        lng: next.lng,
      });
      setProviderId(provider.id);
      return provider;
    }

    const payload = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.lat !== undefined) { payload.lat = updates.lat; payload.lng = updates.lng; }
    if (updates.coverage !== undefined) payload.coverage = updates.coverage;
    if (updates.photoUrl !== undefined) {
      payload.photoUrl = updates.photoUrl;
      payload.photoPublicId = updates.photoPublicId;
    }
    if (!Object.keys(payload).length) return null;

    const { provider } = await updateProvider(providerId, payload);
    return provider;
  }, [form, providerId]);

  if (!isAuthed && !booting) {
    // Account creation runs through the normal auth screens; this wizard is
    // only about the business.
    return (
      <div className="min-h-screen bg-[#f4f6f8] flex items-center justify-center px-4">
        <Card className="max-w-sm w-full text-center space-y-4">
          <h1 className="text-xl font-bold text-gray-900">
            {t('প্রথমে অ্যাকাউন্ট লাগবে', 'You need an account first')}
          </h1>
          <p className="text-sm text-gray-600">
            {t('আগে থেকে To-Let Pro ব্যবহার করে থাকলে সেই নম্বর দিয়েই ঢুকুন — নতুন অ্যাকাউন্ট লাগবে না।',
               'Already use To-Let Pro? Sign in with that number — no second account needed.')}
          </p>
          <Button variant="primary" size="lg" fullWidth onClick={() => navigate('/login')}>
            {t('লগইন করুন', 'Sign in')}
          </Button>
        </Card>
      </div>
    );
  }

  if (catsLoading || booting) return <div className="min-h-screen flex items-center justify-center"><LoadingState /></div>;
  if (catsError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ErrorState message={catsError.message} onRetry={retry} />
      </div>
    );
  }

  const go = async (updates = {}, direction = 1) => {
    patch(updates);
    if (direction < 0) { setStep((s) => Math.max(0, s - 1)); return; }

    const name = STEPS[step];
    // The draft cannot exist before there is a name, a category and a pin, so
    // the first three steps just move forward locally.
    const shouldPersist = name === 'location' || providerId;

    if (shouldPersist) {
      setSaving(true);
      try {
        await persist(updates);
      } catch (err) {
        toast.error(err.message);
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  /** Step 5 — the category's own questions. Saved partially. */
  const saveFields = async () => {
    setSaving(true);
    setFieldErrs({});
    try {
      const payload = serialiseFields(category, form.fields);
      await updateFields(providerId, payload, { partial: true });
      setStep((s) => s + 1);
    } catch (err) {
      if (err.code === 'invalid_fields') {
        setFieldErrs(errorsByKey(err.details));
        toast.error(t('কিছু তথ্য ঠিক করতে হবে', 'Some answers need fixing'));
      } else {
        toast.error(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = async (file) => {
    if (!file) return;
    setUploadPct(0);
    try {
      const { url, publicId } = await uploadImage(file, 'providers/photos', setUploadPct);
      patch({ photoUrl: url, photoPublicId: publicId });
      await updateProvider(providerId, { photoUrl: url, photoPublicId: publicId });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploadPct(null);
    }
  };

  const submit = async () => {
    setSaving(true);
    setFieldErrs({});
    try {
      await submitForReview(providerId);
      await refreshProviders();
      toast.success(t('জমা হয়েছে! যাচাই শেষে চালু হবে।', 'Submitted! Live once verified.'));
      navigate('/', { replace: true });
    } catch (err) {
      if (err.code === 'invalid_fields') {
        setFieldErrs(errorsByKey(err.details));
        setStep(STEPS.indexOf('fields'));
        toast.error(t('কিছু তথ্য বাকি আছে', 'Some answers are missing'));
      } else if (err.code === 'incomplete_registration') {
        toast.error(t('রেজিস্ট্রেশন সম্পূর্ণ হয়নি', 'Registration is incomplete'));
      } else {
        toast.error(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  // ─── Steps ─────────────────────────────────────────────────────────────────
  const current = STEPS[step];

  const heading = {
    category: t('কী ধরনের সেবা দেন?', 'What do you provide?'),
    name:     category ? t(category.nameLabel.bn, category.nameLabel.en) : '',
    location: t('আপনার অবস্থান কোথায়?', 'Where are you?'),
    coverage: t('কতদূর পর্যন্ত সেবা দেন?', 'How far do you serve?'),
    fields:   t('আপনার দাম ও তথ্য', 'Your prices and details'),
    photo:    category ? t(category.photoLabel.bn, category.photoLabel.en) : '',
  }[current];

  return (
    <div className="min-h-screen bg-[#f4f6f8]">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => go({}, -1)}
                className="w-11 h-11 -ml-2 rounded-xl flex items-center justify-center text-gray-600 active:scale-95"
                aria-label={t('পিছনে', 'Back')}
              >
                <ArrowLeft size={22} />
              </button>
            ) : null}
            <h1 className="text-lg font-bold text-gray-900 flex-1 leading-tight">{heading}</h1>
          </div>
          <StepBar index={step} total={STEPS.length} />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 pb-32 space-y-4">
        {/* 1 — category */}
        {current === 'category' ? (
          <div className="grid grid-cols-2 gap-2.5">
            {categories.map((c) => {
              const Icon = iconFor(c.icon);
              const active = form.category === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => go({ category: c.id })}
                  className={[
                    'flex flex-col items-start gap-2 p-4 rounded-2xl border text-left transition-all active:scale-[0.97]',
                    active ? 'bg-crimson-50 border-[#ba0036]' : 'bg-white border-gray-200',
                  ].join(' ')}
                >
                  <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                    active ? 'bg-[#ba0036] text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    <Icon size={22} />
                  </span>
                  <span className="text-base font-bold text-gray-900 leading-tight">
                    {t(c.label.bn, c.label.en)}
                  </span>
                  <span className="text-xs text-gray-500 leading-snug">
                    {t(c.blurb.bn, c.blurb.en)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {/* 2 — name */}
        {current === 'name' ? (
          <Card>
            <Field label={t(category.nameLabel.bn, category.nameLabel.en)} htmlFor="pname" required>
              <input
                id="pname"
                autoFocus
                className={inputClass}
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </Field>
          </Card>
        ) : null}

        {/* 3 — location */}
        {current === 'location' ? (
          <Suspense fallback={<div className="h-72 rounded-2xl bg-gray-100 animate-pulse" />}>
            <LocationPicker
              value={{ lat: form.lat, lng: form.lng }}
              onChange={(lat, lng) => patch({ lat, lng })}
            />
          </Suspense>
        ) : null}

        {/* 4 — coverage */}
        {current === 'coverage' ? (
          <Card className="space-y-3">
            <p className="text-sm text-gray-600">
              {t('যত দূর পর্যন্ত আপনি যেতে রাজি।', 'How far you are willing to travel.')}
            </p>
            <div className="grid gap-2.5">
              {[
                { km: 1.5, bn: 'এই এলাকা (১.৫ কিমি)', en: 'This area (1.5 km)' },
                { km: 3,   bn: '৩ কিলোমিটার',          en: '3 km' },
                { km: 5,   bn: '৫ কিলোমিটার',          en: '5 km' },
              ].map((opt) => {
                const active = (form.coverage?.radiusKm ?? category.defaultCoverage?.radiusKm) === opt.km;
                return (
                  <button
                    key={opt.km}
                    type="button"
                    onClick={() => patch({ coverage: { mode: 'radius', radiusKm: opt.km } })}
                    className={[
                      'flex items-center justify-between px-4 py-4 rounded-xl border text-base font-bold min-h-tap transition-all active:scale-[0.98]',
                      active ? 'bg-crimson-50 border-[#ba0036] text-[#ba0036]' : 'bg-white border-gray-300 text-gray-800',
                    ].join(' ')}
                  >
                    {t(opt.bn, opt.en)}
                    {active ? <Check size={18} /> : null}
                  </button>
                );
              })}
            </div>
          </Card>
        ) : null}

        {/* 5 — the category's own questions */}
        {current === 'fields' ? (
          <div className="space-y-4">
            {category.providerFields.map((f) => (
              <Card key={f.key}>
                <FieldRenderer
                  field={f}
                  value={form.fields[f.key]}
                  error={fieldErrs[f.key]}
                  onChange={(key, v) => patch({ fields: { ...form.fields, [key]: v } })}
                />
              </Card>
            ))}
          </div>
        ) : null}

        {/* 6 — photo + submit */}
        {current === 'photo' ? (
          <div className="space-y-4">
            <Card className="space-y-3">
              {form.photoUrl ? (
                <img
                  src={form.photoUrl}
                  alt=""
                  className="w-full h-52 object-cover rounded-xl border border-gray-200"
                />
              ) : null}

              <label className="block">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => pickPhoto(e.target.files?.[0])}
                />
                <span className={[
                  'flex items-center justify-center gap-2 w-full min-h-tap px-5 py-3.5 rounded-2xl',
                  'border-2 border-dashed border-gray-300 text-base font-bold text-gray-700',
                  'cursor-pointer active:scale-[0.98] transition-all',
                ].join(' ')}>
                  {uploadPct !== null ? (
                    <><Loader2 size={19} className="animate-spin" /> {uploadPct}%</>
                  ) : (
                    <><Camera size={19} /> {form.photoUrl
                      ? t('ছবি বদলান', 'Change photo')
                      : t('ছবি তুলুন', 'Take a photo')}</>
                  )}
                </span>
              </label>

              {/* Says plainly what is NOT being asked for. A registration form
                  that looks like it might demand an NID next is one people
                  abandon before finding out that it doesn't. */}
              <p className="text-xs text-gray-500 leading-relaxed">
                {t('NID এখন লাগবে না। পরে যাচাই করলে সবুজ ভেরিফাইড ব্যাজ পাবেন।',
                   'No NID needed now. Verify later to earn the green badge.')}
              </p>
            </Card>

            <Card className="space-y-1.5">
              <p className="text-sm font-bold text-gray-500">{t('জমা দিচ্ছেন', 'Submitting')}</p>
              <p className="text-base font-bold text-gray-900">{form.name}</p>
              <p className="text-sm text-gray-600">
                {t(category.label.bn, category.label.en)}
                {' · '}
                {/* Bengali numerals — a Latin "3" sitting inside a Bangla
                    sentence is exactly the kind of small wrongness this
                    audience notices. */}
                {bn
                  ? toBnDigits(form.coverage?.radiusKm ?? category.defaultCoverage?.radiusKm)
                  : (form.coverage?.radiusKm ?? category.defaultCoverage?.radiusKm)}
                {' '}{t('কিমি', 'km')}
              </p>
            </Card>
          </div>
        ) : null}
      </main>

      {/* One action, pinned, always in the same place. */}
      <div
        className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 py-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      >
        <div className="max-w-2xl mx-auto">
          {current === 'photo' ? (
            <Button
              variant="primary" size="lg" fullWidth loading={saving}
              disabled={!form.photoUrl}
              onClick={submit}
            >
              {t('জমা দিন', 'Submit')}
            </Button>
          ) : current === 'fields' ? (
            <Button variant="primary" size="lg" fullWidth loading={saving} onClick={saveFields}>
              {t('পরবর্তী', 'Next')}
            </Button>
          ) : current !== 'category' ? (
            <Button
              variant="primary" size="lg" fullWidth loading={saving}
              disabled={
                (current === 'name' && !form.name.trim())
                || (current === 'location' && !Number.isFinite(form.lat))
              }
              onClick={() => go({})}
            >
              {t('পরবর্তী', 'Next')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
