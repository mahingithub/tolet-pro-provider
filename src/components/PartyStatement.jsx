import React, { useCallback, useEffect, useState } from 'react';
import { X, FileText, Send, Download } from 'lucide-react';
import { toast } from 'sonner';

import { useLang, toBnDigits, formatTaka } from '../context/LanguageContext.jsx';
import { getPartyStatement, sendStatement } from '../services/ledgerService.js';
import { downloadCsv } from '../utils/csv.js';
import { Button } from './ui/index.js';
import LoadingState from './common/LoadingState.jsx';
import ErrorState from './common/ErrorState.jsx';

/**
 * বিবরণী — the statement, in the Tally sense.
 * ──────────────────────────────────────────────────────────────────────────
 * Opening balance, every line in the period with the balance AFTER it, closing
 * balance. It is the one page in this app designed to be read by TWO people:
 * the shopkeeper turns the phone around and the customer follows the column
 * down to the number at the bottom.
 *
 * ─── WHY THIS IS A SEPARATE VIEW FROM THE PARTY PAGE ─────────────────────────
 * The party page is offline-first by design — an entry appears the instant he
 * taps, before it has left the phone, and the list runs newest-first the way he
 * flips a paper page backwards. Neither of those works for a statement:
 *
 *   • A running balance only reads downwards, oldest first.
 *   • A total that includes entries the server has not accepted is a total the
 *     customer can be shown and the shopkeeper cannot defend.
 *
 * So this view reads from the server and says plainly when something is still
 * queued, rather than quietly folding unsynced lines into a number somebody is
 * about to be asked to agree with.
 */

/** This month, as the server's 'YYYY-MM-DD' day keys, Dhaka-local. */
function thisMonth() {
  const now = new Date();
  const key = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return { from: `${key.slice(0, 7)}-01`, to: key };
}

/** Shift a 'YYYY-MM' back by n months and return its first/last day keys. */
function monthRange(offset) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const last = new Date(Date.UTC(y, d.getUTCMonth() + 1, 0)).getUTCDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, '0')}` };
}

const PartyStatement = ({
  partyId, partyName, pendingCount = 0, canSend = false, onClose,
}) => {
  const { t, bn } = useLang();
  const [range, setRange] = useState(() => thisMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getPartyStatement(partyId, range));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [partyId, range]);

  useEffect(() => { load(); }, [load]);

  const onSend = async () => {
    setSending(true);
    try {
      await sendStatement(partyId, range);
      toast.success(t('বিবরণী পাঠানো হয়েছে।', 'Statement sent.'));
    } catch (err) {
      // The server's refusals here are rules — no consent, no number, already
      // sent today. Shown as they come rather than flattened into "failed".
      toast.error(err.message || t('পাঠানো গেল না', 'Could not send'));
    } finally {
      setSending(false);
    }
  };

  /**
   * The same statement as a file. Rows come straight from the server payload —
   * nothing here recomputes a balance, because a CSV that did its own
   * arithmetic would be a third place for the running total to disagree.
   */
  const exportCsv = () => {
    if (!data) return;
    const rows = [
      ['তারিখ', 'ধরন', 'টাকা', 'বিবরণ', 'জের'],
      ['', 'আগের জের', data.opening, '', data.opening],
      ...data.entries.map((e) => [
        e.dayKey,
        e.kind === 'credit' ? 'দিলাম' : 'পেলাম',
        e.voidedAt ? 0 : e.amount,
        e.voidedAt ? `${e.note} (বাতিল)`.trim() : e.note,
        e.balanceAfter,
      ]),
      [],
      ['', 'মোট দিলাম', data.totals.credit],
      ['', 'মোট পেলাম', data.totals.payment],
      ['', 'বর্তমান জের', data.closing],
    ];
    downloadCsv(`${partyName}-${data.range.from}-to-${data.range.to}.csv`, rows);
    toast.success(t('ফাইল নামানো হয়েছে', 'File downloaded'));
  };

  const num = (v) => (bn ? toBnDigits(v) : v);
  const fmtDay = (iso) => new Date(iso).toLocaleDateString(bn ? 'bn-BD' : 'en-GB', {
    day: 'numeric', month: 'short',
  });

  /** Never show a negative. Below zero the shop owes THEM, and says so. */
  const standing = (v) => (v >= 0
    ? { label: t('পাবেন', 'To receive'), value: v, tone: 'text-[#ba0036]' }
    : { label: t('দেবেন', 'To pay'), value: -v, tone: 'text-emerald-700' });

  const PERIODS = [
    { key: 'this', label: t('এই মাস', 'This month'), get: () => thisMonth() },
    { key: 'last', label: t('গত মাস', 'Last month'), get: () => monthRange(1) },
    { key: 'all', label: t('সব', 'All'), get: () => ({ from: '2000-01-01', to: thisMonth().to }) },
  ];

  const open = data ? standing(data.opening) : null;
  const close = data ? standing(data.closing) : null;

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col">
      <header className="sticky top-0 bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 -ml-2 rounded-xl flex items-center justify-center text-gray-600 active:scale-95"
            aria-label={t('বন্ধ', 'Close')}
          >
            <X size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#ba0036]">
              {t('বিবরণী', 'Statement')}
            </p>
            <h2 className="text-base font-bold text-gray-900 truncate">{partyName}</h2>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm font-bold text-gray-700 disabled:opacity-40 active:scale-[0.97]"
          >
            <Download size={15} /> CSV
          </button>
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-2">
          {PERIODS.map((p) => {
            const r = p.get();
            const active = r.from === range.from && r.to === range.to;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setRange(r)}
                className={[
                  'px-4 py-2 rounded-xl border text-sm font-bold transition-all active:scale-[0.97]',
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

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto">
          {loading ? (
            <div className="py-16 flex justify-center"><LoadingState /></div>
          ) : error ? (
            <div className="py-16"><ErrorState message={error.message} onRetry={load} /></div>
          ) : (
            <>
              {/* Said out loud rather than silently folded in. A statement the
                  customer is looking at must not include lines the book has
                  not accepted yet. */}
              {pendingCount > 0 ? (
                <div className="mx-4 mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                  <p className="text-sm font-bold text-amber-900">
                    {t(`${num(pendingCount)}টি হিসাব এখনো সার্ভারে যায়নি`,
                       `${pendingCount} entr${pendingCount === 1 ? 'y is' : 'ies are'} not synced yet`)}
                  </p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    {t('ইন্টারনেট এলে যোগ হবে — নিচের হিসাবে এগুলো ধরা নেই।',
                       'They will be added once online — this statement does not include them.')}
                  </p>
                </div>
              ) : null}

              {/* Opening */}
              <div className="px-4 pt-4">
                <div className="flex items-baseline justify-between px-4 py-3 rounded-xl bg-gray-50 border border-gray-200">
                  <span className="text-sm font-bold text-gray-600">
                    {t('আগের জের', 'Opening')}
                  </span>
                  <span className={`text-base font-bold tabular-nums ${open.tone}`}>
                    {formatTaka(open.value, bn)}
                    <span className="text-xs font-bold text-gray-500 ml-1.5">{open.label}</span>
                  </span>
                </div>
              </div>

              {/* The lines, oldest first, with the balance after each */}
              <div className="mt-3 bg-white border-y border-gray-200">
                {data.entries.map((e) => {
                  const credit = e.kind === 'credit';
                  const voided = Boolean(e.voidedAt);
                  const after = standing(e.balanceAfter);
                  return (
                    <div
                      key={e.id}
                      className={`flex items-center gap-3 px-4 py-3 border-b border-gray-100 ${voided ? 'opacity-50' : ''}`}
                    >
                      <span className="w-16 shrink-0 text-xs font-bold text-gray-500">
                        {fmtDay(e.at)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={`block text-[15px] font-bold text-gray-900 ${voided ? 'line-through' : ''}`}>
                          {credit ? t('দিলাম', 'Gave') : t('পেলাম', 'Got')}
                        </span>
                        {e.note || voided ? (
                          <span className="block text-xs text-gray-500 truncate">
                            {e.note}
                            {voided ? `${e.note ? ' · ' : ''}${t('বাতিল', 'crossed out')}` : ''}
                          </span>
                        ) : null}
                      </span>
                      <span className={`w-20 text-right text-[15px] font-bold tabular-nums ${
                        voided ? 'line-through text-gray-400'
                          : credit ? 'text-[#ba0036]' : 'text-emerald-700'
                      }`}>
                        {credit ? '+' : '−'}{formatTaka(e.amount, bn)}
                      </span>
                      {/* The running total — the column the customer follows. */}
                      <span className={`w-20 text-right text-[15px] font-bold tabular-nums ${after.tone}`}>
                        {formatTaka(after.value, bn)}
                      </span>
                    </div>
                  );
                })}

                {!data.entries.length ? (
                  <div className="px-4 py-12 text-center">
                    <FileText size={26} className="mx-auto text-gray-300" />
                    <p className="text-base font-bold text-gray-700 mt-2">
                      {t('এই সময়ে কোনো হিসাব নেই', 'No entries in this period')}
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Totals + closing */}
              <div className="px-4 py-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-gray-600">{t('মোট দিলাম', 'Total given')}</span>
                  <span className="font-bold tabular-nums text-[#ba0036]">
                    {formatTaka(data.totals.credit, bn)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-gray-600">{t('মোট পেলাম', 'Total received')}</span>
                  <span className="font-bold tabular-nums text-emerald-700">
                    {formatTaka(data.totals.payment, bn)}
                  </span>
                </div>

                <div className="flex items-baseline justify-between px-4 py-3.5 rounded-2xl bg-gray-900 text-white mt-1">
                  <span className="text-sm font-bold opacity-80">
                    {t('বর্তমান জের', 'Closing')}
                  </span>
                  <span className="text-xl font-bold tabular-nums">
                    {formatTaka(close.value, bn)}
                    <span className="text-xs font-bold opacity-70 ml-1.5">{close.label}</span>
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div
        className="border-t border-gray-200 bg-white px-4 py-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      >
        <div className="max-w-2xl mx-auto flex gap-3">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
            {t('বন্ধ করুন', 'Close')}
          </Button>
          {/* Offered only when the server would actually allow it. A button
              that always fails teaches him to stop pressing buttons. */}
          {canSend ? (
            <Button
              variant="primary" size="lg" icon={Send} className="flex-1"
              loading={sending} disabled={loading || Boolean(error)}
              onClick={onSend}
            >
              {t('পাঠান', 'Send')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PartyStatement;
