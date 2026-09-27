import React, { useEffect, useMemo, useState } from 'react';
import {
  LogOut, Globe, ShieldCheck, ShieldAlert, Bell, BellOff, MapPin, AlertTriangle, Save,
} from 'lucide-react';
import { toast } from 'sonner';

import { useProviderAuth } from '../context/ProviderAuthContext.jsx';
import { useLang } from '../context/LanguageContext.jsx';
import { useCategories } from '../hooks/useCategories.js';
import { Button, Card, Badge } from '../components/ui/index.js';
import CoverageEditor, {
  isCoverageComplete, CoverageSummary, FALLBACK_COVERAGE,
} from '../components/CoverageEditor.jsx';
import { updateKhataSettings } from '../services/ledgerService.js';
import { updateProvider } from '../services/providerService.js';
import * as push from '../services/pushService.js';

/**
 * Profile — identity, verification state, coverage, language, sign out.
 *
 * The verification row is the important one. An unverified provider is listed
 * and callable, just unbadged and ranked below verified peers — so this screen
 * has to make the badge feel like something worth earning rather than a
 * punishment for not having uploaded an NID yet.
 *
 * Hours editing still to build.
 */

/**
 * The notification switch.
 *
 * Lives behind a TAP and nowhere else. A browser permission prompt fired on app
 * load is how people press Block — and a blocked origin cannot be un-blocked
 * from inside the app, it is a setting buried in Chrome that this audience will
 * never find. One badly-timed prompt costs the channel permanently, so the
 * prompt only ever follows somebody deliberately asking for it.
 */
function PushRow() {
  const { t } = useLang();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    setBlocked(push.permission() === 'denied');
    push.isEnabled().then(setOn);
  }, []);

  if (!push.isSupported()) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      if (on) {
        await push.disable();
        setOn(false);
        toast.success(t('বন্ধ করা হলো', 'Turned off'));
        return;
      }
      const res = await push.enable();
      if (res.ok) {
        setOn(true);
        toast.success(t('চালু হলো — নতুন অর্ডার ফোনে আসবে', 'On — new orders will reach this phone'));
        return;
      }
      if (res.reason === 'denied') {
        setBlocked(true);
        // Said plainly, because the fix is not in this app and pretending
        // otherwise leaves him tapping a button that will never work.
        toast.error(t('ব্রাউজারে নোটিফিকেশন বন্ধ করা আছে — সেটিংস থেকে চালু করুন।',
          'Notifications are blocked in your browser — turn them on in settings.'));
        return;
      }
      toast.error(t('চালু করা গেল না', 'Could not turn it on'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-bold text-gray-800">
          {on ? <Bell size={16} className="text-emerald-600" /> : <BellOff size={16} className="text-gray-400" />}
          {t('অর্ডারের নোটিফিকেশন', 'Order notifications')}
        </span>
        {on ? <Badge tone="success">{t('চালু', 'On')}</Badge> : null}
      </div>
      <p className="text-sm text-gray-600 leading-relaxed">
        {/* The reason, not the feature. He is being measured on a 30-minute
            clock and this is the thing that stops him losing on it. */}
        {t('নতুন অর্ডার এলে সাথে সাথে ফোনে দেখাবে। উত্তর দিতে ৩০ মিনিট সময় থাকে — দেরি হলে অর্ডার বাতিল হয়ে যায়।',
           'New orders show on your phone straight away. You get 30 minutes to answer before an order expires.')}
      </p>
      <Button
        variant={on ? 'secondary' : 'primary'}
        fullWidth
        loading={busy}
        disabled={blocked && !on}
        onClick={toggle}
      >
        {on ? t('বন্ধ করুন', 'Turn off') : t('চালু করুন', 'Turn on')}
      </Button>
      {blocked && !on ? (
        <p className="text-xs text-amber-700 font-semibold">
          {t('ব্রাউজার সেটিংস থেকে এই সাইটের নোটিফিকেশন অনুমতি দিন।',
             'Allow notifications for this site in your browser settings.')}
        </p>
      ) : null}
    </Card>
  );
}
/**
 * CoverageRow — where he actually works, editable after registration.
 *
 * This is not a settings nicety. Until the coverage step could pick thanas, an
 * `areas` category (ইন্টারনেট, গৃহকর্মী) saved every provider with an empty
 * list, and an empty list is not "serves everywhere" — the browse query's
 * `$in` makes it "serves nobody" for every tenant whose thana is known. Those
 * providers are live, have paid the registration fee, and cannot be found, and
 * nothing in the app told them so.
 *
 * So the warning below is the point of the card, not decoration: it names the
 * consequence in the provider's own terms and puts the fix one tap away. The
 * backfill script (backend scripts/backfill-areas-coverage.js) can only reach
 * the ones whose own thana we recorded; everyone else has to be told.
 */
function CoverageRow() {
  const { activeProvider, refreshProviders } = useProviderAuth();
  const { t } = useLang();
  const { byId, meta, loading: catsLoading } = useCategories();

  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const category = activeProvider ? byId(activeProvider.category) : null;
  const saved = activeProvider?.coverage || null;
  const mode = saved?.mode || category?.defaultCoverage?.mode || 'radius';

  // Same ladder the registration wizard offers — the category's own if it has
  // one (শিফটিং goes 5/10/20), else the shared default from the registry.
  const options = useMemo(
    () => category?.coverageOptions || meta?.coverageOptions || FALLBACK_COVERAGE,
    [category, meta],
  );

  if (!activeProvider || catsLoading || !category) return null;

  const value = draft || saved || (mode === 'areas'
    ? { mode: 'areas', thanas: [] }
    : { mode: 'radius', radiusKm: category.defaultCoverage?.radiusKm });

  const invisible = mode === 'areas' && !(saved?.thanas || []).length;

  const save = async () => {
    setSaving(true);
    try {
      await updateProvider(activeProvider.id, { coverage: value });
      await refreshProviders();
      setDraft(null);
      setEditing(false);
      toast.success(t('সেভ হয়েছে', 'Saved'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-bold text-gray-800">
          <MapPin size={16} className="text-gray-400" />
          {mode === 'areas'
            ? t('যে এলাকাগুলোতে সেবা দেন', 'Areas you serve')
            : t('যতদূর পর্যন্ত যান', 'How far you travel')}
        </span>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-bold text-[#ba0036] active:scale-95 transition-transform"
          >
            {t('বদলান', 'Change')}
          </button>
        ) : null}
      </div>

      {invisible ? (
        <p className="flex items-start gap-2 text-sm font-semibold text-red-800 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 leading-relaxed">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          {t('আপনি এখনো কোনো এলাকা বাছেননি, তাই ভাড়াটিয়ারা খুঁজলে আপনাকে পাচ্ছেন না। নিচে এলাকা বেছে দিন।',
             'You haven\'t chosen any areas yet, so tenants searching cannot find you. Pick your areas below.')}
        </p>
      ) : (
        <p className="text-sm text-gray-600"><CoverageSummary coverage={saved} /></p>
      )}

      {editing || invisible ? (
        <div className="space-y-3 pt-1">
          <CoverageEditor
            mode={mode}
            value={value}
            options={options}
            onChange={setDraft}
          />
          <div className="flex gap-2.5">
            <Button
              variant="primary"
              fullWidth
              icon={Save}
              loading={saving}
              disabled={!draft || !isCoverageComplete(value)}
              onClick={save}
            >
              {t('সেভ করুন', 'Save')}
            </Button>
            {editing && !invisible ? (
              <Button
                variant="secondary"
                onClick={() => { setDraft(null); setEditing(false); }}
              >
                {t('বাতিল', 'Cancel')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

const Profile = () => {
  const { activeProvider, user, setUser, logout } = useProviderAuth();
  const { t, lang, setLang } = useLang();

  const verified = activeProvider?.isVerified;

  // Defaults ON, because a kill switch that has to be armed before it can be
  // used is not a kill switch. It gates nothing on its own — consent is per
  // customer and defaults off — so nothing sends until he arms it there.
  const autoOn = user?.khataAutoReminders !== false;

  const toggleAutoReminders = async () => {
    try {
      const res = await updateKhataSettings({ autoReminders: !autoOn });
      setUser(res.merchant);
      toast.success(res.merchant.khataAutoReminders
        ? t('স্বয়ংক্রিয় রিমাইন্ডার চালু', 'Automatic reminders on')
        : t('সব স্বয়ংক্রিয় রিমাইন্ডার বন্ধ', 'All automatic reminders off'));
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start lg:max-w-4xl">
      <Card>
        <p className="text-sm font-bold text-gray-500">{t('প্রোভাইডার', 'Provider')}</p>
        <p className="text-lg font-bold text-gray-900">{activeProvider?.name || user?.name}</p>
        <p className="text-sm text-gray-600">{activeProvider?.phone || user?.phone}</p>
      </Card>

      <Card className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-gray-800">{t('যাচাইকরণ', 'Verification')}</span>
          {verified ? (
            <Badge tone="success" icon={ShieldCheck}>{t('ভেরিফাইড', 'Verified')}</Badge>
          ) : (
            <Badge tone="warn" icon={ShieldAlert}>{t('অযাচাইকৃত', 'Unverified')}</Badge>
          )}
        </div>
        {!verified ? (
          <p className="text-sm text-gray-600 leading-relaxed">
            {t('NID দিয়ে যাচাই করলে আপনার নামের পাশে সবুজ ব্যাজ আসবে এবং আপনি সার্চে উপরে থাকবেন।',
               'Verify with your NID to get the green badge and rank higher in search.')}
          </p>
        ) : null}
      </Card>

      {/* Directly under verification, and above the conveniences. A provider
          nobody can find has a more urgent problem than his language setting. */}
      <CoverageRow />

      <PushRow />

      <Card className="space-y-2.5">
        <span className="flex items-center gap-2 text-sm font-bold text-gray-800">
          <Globe size={16} className="text-gray-400" />
          {t('ভাষা', 'Language')}
        </span>
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant={lang === 'bn' ? 'primary' : 'secondary'} onClick={() => setLang('bn')}>
            বাংলা
          </Button>
          <Button variant={lang === 'en' ? 'primary' : 'secondary'} onClick={() => setLang('en')}>
            English
          </Button>
        </div>
      </Card>

      {/* The panic button. One tap stops every automated খাতা reminder he has
          switched on, without going page by page — which is what he will want
          the moment a customer complains about one. */}
      <Card className="space-y-2.5">
        <button
          type="button"
          onClick={toggleAutoReminders}
          className="w-full flex items-start gap-3 text-left active:scale-[0.99] transition-transform"
        >
          <span className={[
            'mt-0.5 w-10 h-6 shrink-0 rounded-full transition-colors relative',
            autoOn ? 'bg-emerald-500' : 'bg-gray-300',
          ].join(' ')}>
            <span className={[
              'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform',
              autoOn ? 'translate-x-[18px]' : 'translate-x-0.5',
            ].join(' ')} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-gray-800">
              {t('স্বয়ংক্রিয় বাকির রিমাইন্ডার', 'Automatic credit reminders')}
            </span>
            <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">
              {autoOn
                ? t('যাদের জন্য চালু করেছেন শুধু তাদেরই যাবে। বন্ধ করলে সবগুলো একসাথে থামবে।',
                    'Only goes to customers you switched on. Turning this off stops all of them at once.')
                : t('সব বন্ধ আছে — কারও কাছে নিজে নিজে বার্তা যাবে না।',
                    'All off — nothing is sent automatically to anyone.')}
            </span>
          </span>
        </button>
      </Card>

      <Button variant="danger" icon={LogOut} fullWidth onClick={logout}>
        {t('লগ আউট', 'Sign out')}
      </Button>
    </div>
  );
};

export default Profile;
