import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Phone, ShoppingBag, Repeat, Building2, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useProviderAuth } from '../context/ProviderAuthContext.jsx';
import { useLang, toBnDigits, formatTaka } from '../context/LanguageContext.jsx';
import { getStats, listReviews } from '../services/providerService.js';
import { Card } from '../components/ui/index.js';
import { Stars } from './Reviews.jsx';
import LoadingState from '../components/common/LoadingState.jsx';
import ErrorState from '../components/common/ErrorState.jsx';

/**
 * Earnings — the return-on-investment screen, and the reason the registration
 * fee feels worth paying.
 * ──────────────────────────────────────────────────────────────────────────
 * For `contact`-tier categories (গৃহকর্মী, ইলেকট্রিশিয়ান, প্লাম্বার,
 * ইন্টারনেট) there are no orders at all — the tenant simply calls. So the CALL
 * COUNT is not a vanity metric here, it is the only evidence the platform
 * works. "১৪ জন কল করেছে" is a sentence a shopkeeper understands instantly, in
 * a way he does not understand "digital presence".
 *
 * No charts. A number and a label, four times over.
 *
 * ─── EVERY NUMBER IS PEOPLE, NOT TAPS ────────────────────────────────────────
 * The server counts distinct people: someone who rang twice is one customer.
 * That is deliberate and it is worth knowing while reading this screen — an
 * inflated number a shopkeeper does not believe is worse than no number, and he
 * knows perfectly well how many people came.
 *
 * Views arrive as a COUNT and never as identities. Browsing a shop is not
 * consent to hand that shop your name and phone number.
 */

// Exactly the windows the server accepts. Anything else falls back to 30 days
// server-side, so offering a fifth choice here would silently do nothing.
const RANGES = [
  { key: '7d',  bn: '৭ দিন',   en: '7 days' },
  { key: '30d', bn: '৩০ দিন',  en: '30 days' },
  { key: '90d', bn: '৩ মাস',   en: '3 months' },
  { key: 'all', bn: 'সব সময়', en: 'All time' },
];

function Stat({ icon: Icon, value, label, hint }) {
  const { bn } = useLang();
  return (
    <Card className="flex items-center gap-3.5">
      <div className="w-11 h-11 rounded-xl bg-crimson-50 text-[#ba0036] flex items-center justify-center shrink-0">
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 leading-none tabular-nums">
          {bn ? toBnDigits(value ?? 0) : (value ?? 0)}
        </p>
        <p className="text-sm font-bold text-gray-700 mt-1">{label}</p>
        {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
      </div>
    </Card>
  );
}

const Earnings = () => {
  const { activeProvider } = useProviderAuth();
  const { t, bn } = useLang();

  const [range, setRange] = useState('30d');
  const [stats, setStats] = useState(null);
  const [toAnswer, setToAnswer] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!activeProvider) return;
    setLoading(true);
    setError(null);
    try {
      const [s, reviews] = await Promise.all([
        getStats(activeProvider.id, range),
        // Never allowed to fail the screen: the numbers are the job here, and
        // an unanswered-review count is a nicety on top of them.
        listReviews({ unanswered: true }).catch(() => ({ reviews: [] })),
      ]);
      setStats(s);
      setToAnswer((reviews.reviews || []).length);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [activeProvider, range]);

  useEffect(() => { load(); }, [load]);

  if (loading && !stats) return <LoadingState />;
  if (error && !stats) return <ErrorState message={error.message} onRetry={load} />;

  const rating = activeProvider?.ratingAvg || 0;
  const ratingCount = activeProvider?.ratingCount || 0;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            className={[
              'px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap border transition',
              range === r.key
                ? 'bg-[#ba0036] text-white border-transparent'
                : 'bg-white text-gray-600 border-gray-200',
            ].join(' ')}
          >
            {t(r.bn, r.en)}
          </button>
        ))}
      </div>

      {/* Four short tiles. Stacked they push everything else off a desktop
          screen for no reason; side by side they read as one summary row. */}
      <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-4 lg:gap-3">
      <Stat icon={Eye} value={stats?.views} label={t('জন দেখেছেন', 'people viewed')} />
      <Stat
        icon={Phone} value={stats?.contacts}
        label={t('জন যোগাযোগ করেছেন', 'people got in touch')}
        hint={t('ফোন, অনুরোধ ও অর্ডার — একজন দুইবার করলেও একজনই।',
          'Calls, requests and orders — one person is one person.')}
      />
      <Stat icon={ShoppingBag} value={stats?.orders} label={t('অর্ডার সম্পন্ন', 'orders completed')} />
      <Stat
        icon={Repeat} value={stats?.repeatCustomers}
        label={t('জন আবার এসেছেন', 'came back')}
      />
      </div>

      {/* Building density is this platform's real advantage over a general
          marketplace: twelve flats in one building is route economics nobody
          else can match at this price point. */}
      {stats?.topBuilding ? (
        <Card className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Building2 size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{stats.topBuilding.name}</p>
            <p className="text-sm text-gray-600">
              {t(`${toBnDigits(stats.topBuilding.customers)} জন গ্রাহক এই বিল্ডিং থেকে`,
                `${stats.topBuilding.customers} customers from this building`)}
            </p>
          </div>
        </Card>
      ) : null}

      {stats?.salesTotal ? (
        <Card>
          <p className="text-sm font-bold text-gray-600">{t('মোট বিক্রি', 'Total sales')}</p>
          <p className="text-3xl font-bold text-gray-900 tabular-nums mt-1">
            {formatTaka(stats.salesTotal, bn)}
          </p>
          <p className="text-xs text-gray-500 mt-1.5">
            {t('অ্যাপের মাধ্যমে আসা সম্পন্ন অর্ডার থেকে। To-Let Pro কোনো কমিশন নেয় না।',
              'From completed orders placed via the app. To-Let Pro takes no commission.')}
          </p>
        </Card>
      ) : null}

      {/* Reviews live behind this row rather than in a sixth tab: they arrive
          in ones and twos, not daily like orders. The unanswered count is the
          part worth surfacing — a bad review left unanswered is the one that
          costs him the next customer. */}
      <Link to="/reviews" className="block">
        <Card className="flex items-center gap-3.5 hover:border-gray-300 transition">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Stars n={Math.round(rating)} />
              <span className="text-sm font-bold text-gray-900 tabular-nums">
                {ratingCount ? (bn ? toBnDigits(rating) : rating) : '—'}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {ratingCount
                ? t(`${toBnDigits(ratingCount)} টি রিভিউ`, `${ratingCount} reviews`)
                : t('এখনো কোনো রিভিউ নেই', 'No reviews yet')}
              {toAnswer > 0 ? (
                <span className="text-[#ba0036] font-bold">
                  {' · '}
                  {t(`${toBnDigits(toAnswer)} টির উত্তর বাকি`, `${toAnswer} to answer`)}
                </span>
              ) : null}
            </p>
          </div>
          <ChevronRight size={20} className="text-gray-400 shrink-0" />
        </Card>
      </Link>
    </div>
  );
};

export default Earnings;
