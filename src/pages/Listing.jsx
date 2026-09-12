import React, { useCallback, useEffect, useState } from 'react';
import { Save, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { useProviderAuth } from '../context/ProviderAuthContext.jsx';
import { useLang, toBnDigits } from '../context/LanguageContext.jsx';
import { useCategories } from '../hooks/useCategories.js';
import { getProvider, updateFields } from '../services/providerService.js';
import FieldRenderer, { errorsByKey, serialiseFields } from '../components/fields/FieldRenderer.jsx';
import { Button, Card, Badge } from '../components/ui/index.js';
import LoadingState from '../components/common/LoadingState.jsx';
import ErrorState from '../components/common/ErrorState.jsx';

/**
 * Listing — the price editor.
 * ──────────────────────────────────────────────────────────────────────────
 * Exactly the same FieldRenderer loop as step 5 of onboarding, over the same
 * `providerFields`. That is the payoff of keeping the category definition on
 * the server: this screen knows nothing about gas cylinders or lentils.
 *
 * Two things it adds on top of the wizard:
 *
 * 1. THE FRESHNESS BANNER. A price nobody has touched in months is a broken
 *    promise to the tenant, and it is To-Let Pro's name on it. The clock is
 *    per-category — গ্রোসারি goes stale in 7 days, ইন্টারনেট in 180 — so the
 *    state comes from the server rather than being guessed here.
 *
 *    What the banner must never do is threaten delisting. Stale prices hide
 *    the PRICES, never the provider: his phone number still works and it is
 *    the actual product. A banner that reads as "update or disappear" on a
 *    listing somebody paid for is how you generate refund requests.
 *
 * 2. A FULL (not partial) SAVE. Unlike the wizard, this screen shows every
 *    field at once, so there is no later step to be lenient about.
 */

const FRESHNESS = {
  fresh:   { tone: 'success', bn: 'দাম হালনাগাদ',    en: 'Prices up to date' },
  aging:   { tone: 'warn',    bn: 'দাম পুরোনো হচ্ছে', en: 'Prices getting old' },
  stale:   { tone: 'warn',    bn: 'দাম পুরোনো',       en: 'Prices are stale' },
  expired: { tone: 'danger',  bn: 'দাম দেখানো বন্ধ',  en: 'Prices hidden' },
};

function FreshnessBanner({ freshness }) {
  const { t, bn } = useLang();
  if (!freshness || freshness.state === 'fresh') return null;

  const meta = FRESHNESS[freshness.state];
  const days = freshness.ageDays;
  const expired = freshness.state === 'expired';

  return (
    <div className={[
      'rounded-2xl border px-4 py-3.5 space-y-1.5',
      expired ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200',
    ].join(' ')}>
      <p className={`flex items-center gap-2 text-sm font-bold ${expired ? 'text-red-800' : 'text-amber-900'}`}>
        {expired ? <AlertTriangle size={16} /> : <Clock size={16} />}
        {days != null
          ? t(`দাম ${toBnDigits(days)} দিন আগে আপডেট করা`, `Prices updated ${days} days ago`)
          : t('দাম এখনো দেওয়া হয়নি', 'Prices not set yet')}
      </p>
      <p className={`text-sm leading-relaxed ${expired ? 'text-red-700' : 'text-amber-800'}`}>
        {expired
          // Says exactly what happened and what did NOT happen. He is still
          // listed; only the numbers we can no longer stand behind are hidden.
          ? t('ভাড়াটিয়ারা এখন আপনার দাম দেখতে পাচ্ছেন না — তবে আপনার দোকান ও ফোন নম্বর ঠিকই দেখা যাচ্ছে। দাম দিলে আবার দেখাবে।',
              'Tenants can\'t see your prices right now — but your shop and phone number are still listed. Update to bring them back.')
          : t('দাম ঠিক থাকলে নিচে সেভ চাপুন, নাহলে বদলে নিন।',
              'Tap save if they\'re still right, or update them.')}
      </p>
    </div>
  );
}

const Listing = () => {
  const { activeProvider } = useProviderAuth();
  const { t } = useLang();
  const { byId, loading: catsLoading, error: catsError, retry } = useCategories();

  const [provider, setProvider] = useState(null);
  const [freshness, setFreshness] = useState(null);
  const [values, setValues] = useState({});
  const [errs, setErrs] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!activeProvider) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getProvider(activeProvider.id);
      setProvider(data.provider);
      setFreshness(data.freshness);
      setValues(data.provider.fields || {});
      setDirty(false);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [activeProvider]);

  useEffect(() => { load(); }, [load]);

  const category = provider ? byId(provider.category) : null;

  const change = (key, v) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setErrs({});
    try {
      // A full save — every field is on screen, so there is no later step to
      // be lenient about.
      const payload = serialiseFields(category, values);
      const data = await updateFields(provider.id, payload);
      setProvider(data.provider);
      setFreshness(data.freshness);
      setDirty(false);
      toast.success(t('সেভ হয়েছে', 'Saved'));
    } catch (err) {
      if (err.code === 'invalid_fields') {
        setErrs(errorsByKey(err.details));
        toast.error(t('কিছু তথ্য ঠিক করতে হবে', 'Some answers need fixing'));
      } else {
        toast.error(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading || catsLoading) return <LoadingState />;
  if (error || catsError) {
    return (
      <ErrorState
        message={(error || catsError).status === 404
          ? t('সার্ভিসটি এখনো চালু হয়নি।', 'This API is not live yet.')
          : (error || catsError).message}
        onRetry={error ? load : retry}
      />
    );
  }
  if (!category) {
    return <ErrorState message={t('ক্যাটাগরি পাওয়া যায়নি।', 'Category not found.')} onRetry={load} />;
  }

  return (
    <div className="space-y-4 pb-24">
      <FreshnessBanner freshness={freshness} />

      {freshness?.state === 'fresh' && provider.pricesUpdatedAt ? (
        <Badge tone="success">{t(FRESHNESS.fresh.bn, FRESHNESS.fresh.en)}</Badge>
      ) : null}

      {category.providerFields.map((f) => (
        <Card key={f.key}>
          <FieldRenderer
            field={f}
            value={values[f.key]}
            error={errs[f.key]}
            onChange={change}
          />
        </Card>
      ))}

      {/* Pinned above the tab bar, so saving never needs a scroll to find. */}
      <div
        className="fixed inset-x-0 z-40 bg-white border-t border-gray-200 px-4 py-3"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 68px)' }}
      >
        <div className="max-w-2xl mx-auto">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            icon={Save}
            loading={saving}
            disabled={!dirty}
            onClick={save}
          >
            {dirty ? t('সেভ করুন', 'Save') : t('সব সেভ করা আছে', 'All saved')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Listing;
