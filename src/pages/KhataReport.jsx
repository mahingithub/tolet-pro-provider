import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Download, TrendingUp, TrendingDown, Wallet, Users,
  PackagePlus, Smartphone, Landmark, Banknote,
} from 'lucide-react';
import { toast } from 'sonner';

import { useLang, toBnDigits, formatTaka } from '../context/LanguageContext.jsx';
import { getReport } from '../services/ledgerService.js';
import { downloadCsv } from '../utils/csv.js';
import { Card } from '../components/ui/index.js';
import LoadingState from '../components/common/LoadingState.jsx';
import ErrorState from '../components/common/ErrorState.jsx';

/**
 * রিপোর্ট — the month-end page.
 * ──────────────────────────────────────────────────────────────────────────
 * খাতা's front page answers "কত পাব, আজ কত বিক্রি". This one answers the
 * question he asks at the end of a month, which the app previously could not:
 * what came in, what went out, and how much cash the book says should be in
 * the tin.
 *
 * ─── CASH IS NOT MARGIN, AND THE SCREEN SAYS SO ──────────────────────────────
 * নগদ = বিক্রি + পেলাম − খরচ − ক্রয়. দিলাম is deliberately NOT in it: the goods
 * left the shop, the money did not arrive. Folding it in is the quickest way to
 * believe there is money in the tin that is not, so it sits in its own section
 * as what it actually is — a debt he is owed.
 *
 * The margin (বিক্রি − ক্রয় − খরচ) is a SECOND number below, and an estimate.
 * Stock does not sell in the month it is bought, so the two disagree whenever
 * he stocks up — which is exactly why they are shown apart rather than one
 * green figure left to imply whatever the reader hopes.
 *
 * That caption used to read "মালের ক্রয়মূল্য এই খাতায় নেই", which stopped being
 * true the day ক্রয় became its own entry kind. A stale caption on a money
 * screen is worse than none: it tells him to distrust a number that is now
 * right.
 */

/** Dhaka-local 'YYYY-MM-DD' for today. */
function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function monthRange(offset = 0) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const last = new Date(Date.UTC(y, d.getUTCMonth() + 1, 0)).getUTCDate();
  const to = offset === 0 ? todayKey() : `${y}-${m}-${String(last).padStart(2, '0')}`;
  return { from: `${y}-${m}-01`, to };
}

/** Last 7 days including today. */
function weekRange() {
  const to = todayKey();
  const d = new Date(`${to}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 6);
  return { from: d.toISOString().slice(0, 10), to };
}

const KhataReport = () => {
  const navigate = useNavigate();
  const { t, bn } = useLang();

  const [range, setRange] = useState(() => monthRange(0));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getReport(range));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const num = (v) => (bn ? toBnDigits(v) : v);

  const PERIODS = [
    { key: 'today', label: t('আজ', 'Today'), get: () => ({ from: todayKey(), to: todayKey() }) },
    { key: 'week', label: t('৭ দিন', '7 days'), get: weekRange },
    { key: 'month', label: t('এই মাস', 'This month'), get: () => monthRange(0) },
    { key: 'last', label: t('গত মাস', 'Last month'), get: () => monthRange(1) },
  ];

  const exportCsv = () => {
    if (!data) return;
    // One row per day, plus a totals row. Latin digits on purpose — a
    // spreadsheet cannot add up ৳১২৫০.
    const rows = [
      ['তারিখ', 'বিক্রি', 'ক্রয়', 'খরচ', 'দিলাম (বাকি)', 'পেলাম (আদায়)', 'নগদ'],
      ...data.days.map((d) => [
        d.dayKey, d.sale, d.purchase || 0, d.expense, d.credit, d.payment,
        d.sale + d.payment - d.expense - (d.purchase || 0),
      ]),
      [],
      ['মোট', data.totals.sale, data.totals.purchase || 0, data.totals.expense,
        data.totals.credit, data.totals.payment, data.totals.netCash],
      ['আনুমানিক লাভ', data.totals.margin || 0],
      [],
      ['অ্যাকাউন্ট', 'জমা', 'খরচ', 'ব্যালান্স'],
      ...(data.accounts || []).map((a) => [a.id, a.in, a.out, a.balance]),
      [],
      ['আগের বাকি', data.receivable.opening],
      ['নতুন বাকি', data.receivable.given],
      ['আদায়', data.receivable.collected],
      ['বর্তমান বাকি', data.receivable.closing],
    ];
    downloadCsv(`khata-${data.range.from}-to-${data.range.to}.csv`, rows);
    toast.success(t('ফাইল নামানো হয়েছে', 'File downloaded'));
  };

  /**
   * `whitespace-nowrap` is load-bearing at three-across on a 375px phone: a
   * five-digit total wrapped between the ৳ and its digits, so "৳ ১৮,৫০০" read
   * as two separate things on two lines. `text-lg` keeps the common case on
   * one line; anything longer scrolls its own tile rather than reflowing the
   * row.
   */
  const Stat = ({ icon: Icon, label, value, tone = 'text-gray-900', hint }) => (
    <div className="p-3.5 rounded-2xl bg-white border border-gray-100 shadow-[0_1px_2px_rgba(16,24,40,0.04)] min-w-0">
      <span className="flex items-center gap-1.5 text-xs font-bold text-gray-500">
        <Icon size={14} className="shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <span className={`block text-lg font-bold tabular-nums mt-1 whitespace-nowrap overflow-x-auto ${tone}`}>
        {formatTaka(value, bn)}
      </span>
      {hint ? <span className="block text-[11px] text-gray-500 mt-0.5">{hint}</span> : null}
    </div>
  );

  return (
    <div className="-mx-4 -my-4 lg:mx-0 lg:my-0 min-h-screen lg:min-h-0 bg-[#f4f6f8]">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 lg:rounded-t-2xl">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/khata')}
            className="w-11 h-11 -ml-2 rounded-xl flex items-center justify-center text-gray-600 active:scale-95"
            aria-label={t('পিছনে', 'Back')}
          >
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex-1">
            {t('রিপোর্ট', 'Report')}
          </h1>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-300 bg-white text-sm font-bold text-gray-700 disabled:opacity-40 active:scale-[0.97]"
          >
            <Download size={16} /> CSV
          </button>
        </div>

        <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
          {PERIODS.map((p) => {
            const r = p.get();
            const active = r.from === range.from && r.to === range.to;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setRange(r)}
                className={[
                  'shrink-0 px-4 py-2 rounded-xl border text-sm font-bold transition-all active:scale-[0.97]',
                  active
                    ? 'bg-[#ba0036] border-[#ba0036] text-white'
                    : 'bg-white border-gray-300 text-gray-700',
                ].join(' ')}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </header>

      {loading ? (
        <div className="py-16 flex justify-center"><LoadingState /></div>
      ) : error ? (
        <div className="py-16"><ErrorState message={error.message} onRetry={load} /></div>
      ) : (
        <div className="px-4 py-4 space-y-4 lg:max-w-3xl">
          {/* The number he checks against the tin box */}
          <Card className="bg-gradient-to-br from-gray-900 to-gray-700 border-0 text-white">
            <p className="text-sm font-bold opacity-80">{t('নগদ হাতে এসেছে', 'Net cash')}</p>
            <p className="text-4xl font-bold tabular-nums mt-1">
              {formatTaka(data.totals.netCash, bn)}
            </p>
            {/* Said out loud so a big number is never mistaken for profit. */}
            <p className="text-[11px] opacity-70 mt-2 leading-relaxed">
              {t('বিক্রি + আদায় − খরচ − ক্রয়। টাকার আসা-যাওয়া — লাভ নিচে আলাদা।',
                 'Sale + collected − expenses − stock. Money in and out; the margin is below.')}
            </p>
          </Card>

          <div className="grid grid-cols-3 gap-2.5">
            <Stat icon={TrendingUp} label={t('বিক্রি', 'Sales')}
              value={data.totals.sale} tone="text-emerald-700" />
            <Stat icon={PackagePlus} label={t('ক্রয়', 'Stock')}
              value={data.totals.purchase || 0} tone="text-gray-900" />
            <Stat icon={TrendingDown} label={t('খরচ', 'Expenses')}
              value={data.totals.expense} tone="text-[#ba0036]" />
          </div>

          {/* বিক্রি − ক্রয় − খরচ. Labelled আনুমানিক and explained, because it
              is not profit in the accounting sense: stock does not sell in the
              month it is bought, so a big delivery makes a good month look
              terrible. Better a rough number he can sanity-check than the app
              refusing to answer "লাভ কত হলো" at all. */}
          <Card>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-gray-600">
                {t('আনুমানিক লাভ', 'Estimated margin')}
              </span>
              <span className={`text-2xl font-bold tabular-nums ${
                (data.totals.margin || 0) >= 0 ? 'text-emerald-700' : 'text-[#ba0036]'
              }`}>
                {formatTaka(data.totals.margin || 0, bn)}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
              {t('বিক্রি − ক্রয় − খরচ। অনুমান মাত্র — এক মাসে বেশি মাল তুললে সেই মাস খারাপ দেখাবে, যদিও মাল দোকানেই আছে।',
                 'Sale − stock − expenses. An estimate: a month with a big delivery looks bad even though the stock is still on the shelf.')}
            </p>
          </Card>

          {/* নগদ / বিকাশ / ব্যাংক — the half of "Tally" a shopkeeper asks for. */}
          <div>
            <h2 className="text-sm font-bold text-gray-600 px-1 mb-2">
              {t('কোথায় কত আছে', 'By account')}
            </h2>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: 'cash', icon: Banknote, bn: 'নগদ', en: 'Cash' },
                { id: 'bkash', icon: Smartphone, bn: 'বিকাশ', en: 'bKash' },
                { id: 'bank', icon: Landmark, bn: 'ব্যাংক', en: 'Bank' },
              ].map((a) => {
                const row = (data.accounts || []).find((x) => x.id === a.id);
                return (
                  <Stat key={a.id} icon={a.icon} label={t(a.bn, a.en)}
                    value={row?.balance || 0}
                    tone={(row?.balance || 0) < 0 ? 'text-[#ba0036]' : 'text-gray-900'} />
                );
              })}
            </div>
            <p className="text-[11px] text-gray-500 mt-2 px-1 leading-relaxed">
              {t('খাতা অনুযায়ী — যা লিখেছেন তার হিসাব। আসল বিকাশ ব্যালান্সের সাথে না মিললে কোনো এন্ট্রি বাদ পড়েছে।',
                 'According to the book. A gap against your real balance means an entry is missing.')}
            </p>
          </div>

          {/* বাকি — kept out of the cash figure above, on purpose */}
          <div>
            <h2 className="text-sm font-bold text-gray-600 px-1 mb-2">
              {t('বাকির হিসাব', 'Credit')}
            </h2>
            <Card className="space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="font-bold text-gray-600">{t('আগের বাকি', 'Opening')}</span>
                <span className="font-bold tabular-nums">{formatTaka(data.receivable.opening, bn)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-bold text-gray-600">{t('নতুন বাকি দিয়েছেন', 'Given')}</span>
                <span className="font-bold tabular-nums text-[#ba0036]">
                  +{formatTaka(data.receivable.given, bn)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-bold text-gray-600">{t('আদায় হয়েছে', 'Collected')}</span>
                <span className="font-bold tabular-nums text-emerald-700">
                  −{formatTaka(data.receivable.collected, bn)}
                </span>
              </div>
              <div className="flex justify-between pt-2.5 border-t border-gray-200">
                <span className="text-base font-bold text-gray-900">{t('এখন পাবেন', 'Still owed')}</span>
                <span className="text-base font-bold tabular-nums text-[#ba0036]">
                  {formatTaka(data.receivable.closing, bn)}
                </span>
              </div>
            </Card>
          </div>

          {/* Who owes the most — the list he acts on */}
          {data.topDebtors?.length ? (
            <div>
              <h2 className="text-sm font-bold text-gray-600 px-1 mb-2">
                {t('সবচেয়ে বেশি বাকি', 'Largest debts')}
              </h2>
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                {data.topDebtors.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => navigate(`/khata/${p.id}`)}
                    className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 text-left active:bg-gray-50"
                  >
                    <Users size={16} className="shrink-0 text-gray-400" />
                    <span className="flex-1 min-w-0 text-[15px] font-bold text-gray-900 truncate">
                      {p.name}
                    </span>
                    <span className="text-[15px] font-bold tabular-nums text-[#ba0036]">
                      {formatTaka(p.balance, bn)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Day by day. A plain table, not a chart: he reads this the way he
              reads the paper book, one row per day. */}
          {data.days?.length ? (
            <div>
              <h2 className="text-sm font-bold text-gray-600 px-1 mb-2">
                {t('দিন অনুযায়ী', 'Day by day')}
              </h2>
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-[11px] font-bold text-gray-500">
                  <span className="w-14">{t('তারিখ', 'Date')}</span>
                  <span className="flex-1 text-right">{t('বিক্রি', 'Sale')}</span>
                  <span className="flex-1 text-right">{t('ক্রয়', 'Stock')}</span>
                  <span className="flex-1 text-right">{t('খরচ', 'Expense')}</span>
                </div>
                {data.days.map((d) => (
                  <div key={d.dayKey}
                    className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 last:border-0 text-sm">
                    <span className="w-14 font-bold text-gray-600">
                      {new Date(`${d.dayKey}T06:00:00Z`).toLocaleDateString(bn ? 'bn-BD' : 'en-GB',
                        { day: 'numeric', month: 'short' })}
                    </span>
                    <span className="flex-1 text-right tabular-nums font-bold text-emerald-700">
                      {d.sale ? formatTaka(d.sale, bn) : '—'}
                    </span>
                    <span className="flex-1 text-right tabular-nums font-bold text-gray-700">
                      {d.purchase ? formatTaka(d.purchase, bn) : '—'}
                    </span>
                    <span className="flex-1 text-right tabular-nums font-bold text-[#ba0036]">
                      {d.expense ? formatTaka(d.expense, bn) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-sm text-gray-500 py-8">
              {t('এই সময়ে কোনো হিসাব নেই।', 'No entries in this period.')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default KhataReport;
