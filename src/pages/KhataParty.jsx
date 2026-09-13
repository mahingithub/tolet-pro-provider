import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Phone, Send, X, Undo2, CloudOff, Check, FileText,
} from 'lucide-react';
import { toast } from 'sonner';

import { useLang, toBnDigits, formatTaka } from '../context/LanguageContext.jsx';
import {
  getParty, updateParty, remindParty, voidEntry, newClientEntryId,
} from '../services/ledgerService.js';
import { enqueue, pendingForParty, pendingBalanceDelta, onQueueChanged } from '../services/ledgerQueue.js';
import { useLedgerSync } from '../hooks/useLedgerSync.js';
import { Button, Card, Field, inputClass } from '../components/ui/index.js';
import PartyStatement from '../components/PartyStatement.jsx';
import LoadingState from '../components/common/LoadingState.jsx';
import ErrorState from '../components/common/ErrorState.jsx';

/**
 * One page of the বাকির খাতা.
 * ──────────────────────────────────────────────────────────────────────────
 * The balance at the top, the lines underneath, and the two buttons he has
 * used his whole working life pinned to the bottom: **দিলাম** and **পেলাম**.
 *
 * Three things this screen refuses to do:
 *
 *   • It never shows a negative number. Below zero it says দেবেন and shows the
 *     magnitude — the sign is an implementation detail, not something a
 *     shopkeeper should have to interpret.
 *   • It never makes him wait for the network. An entry is committed to the
 *     offline queue and appears immediately, marked as not-yet-synced.
 *   • It does not let him EDIT a line. A mistake is crossed out and rewritten,
 *     exactly as on paper, so the running total always explains itself.
 */

const fmtDay = (iso, bn) => {
  const d = new Date(iso);
  const s = d.toLocaleDateString(bn ? 'bn-BD' : 'en-GB', {
    day: 'numeric', month: 'short',
  });
  return s;
};

/** দিলাম / পেলাম. One amount, one optional note, nothing else. */
function EntrySheet({ open, kind, party, onClose, onQueued }) {
  const { t, bn } = useLang();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  if (!open) return null;
  const isCredit = kind === 'credit';

  const submit = (e) => {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 1) return;

    const clientEntryId = newClientEntryId();
    // Queued, not sent. He is standing in front of a customer — the entry is
    // his the instant he taps, and the network catches up later.
    //
    // The id is minted HERE, before the first attempt: a request that reaches
    // the server and loses its response looks exactly like one that never
    // arrived, and only a pre-minted id makes the retry recognisable as the
    // same entry rather than a second debt.
    enqueue({
      clientEntryId,
      payload: {
        kind,
        partyId: party.id,
        amount: Math.round(n),
        note: note.trim(),
        clientEntryId,
      },
    });

    setAmount(''); setNote('');
    onQueued();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose}
        aria-label={t('বন্ধ', 'Close')} />
      <form
        onSubmit={submit}
        className="relative w-full bg-white rounded-t-3xl p-5 space-y-4 max-w-2xl mx-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {isCredit
              ? t(`${party.name}-কে দিলাম`, `Gave to ${party.name}`)
              : t(`${party.name}-এর কাছ থেকে পেলাম`, `Got from ${party.name}`)}
          </h2>
          <button type="button" onClick={onClose}
            className="w-10 h-10 -mr-2 flex items-center justify-center text-gray-500">
            <X size={22} />
          </button>
        </div>

        <Field label={t('কত টাকা', 'How much')} htmlFor="amt" required>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-gray-400">৳</span>
            <input
              id="amt" type="number" inputMode="numeric" min="1" autoFocus
              value={amount} onChange={(e) => setAmount(e.target.value)}
              className={`${inputClass} pl-11 text-2xl font-bold tabular-nums h-16`}
            />
          </div>
        </Field>

        {/* Common amounts, so the usual case is one tap rather than four. */}
        <div className="flex flex-wrap gap-2">
          {[50, 100, 200, 500, 1000].map((v) => (
            <button
              key={v} type="button"
              onClick={() => setAmount(String((Number(amount) || 0) + v))}
              className="px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-base font-bold text-gray-700 active:scale-95 transition-transform"
            >
              +{bn ? toBnDigits(v) : v}
            </button>
          ))}
        </div>

        <Field label={t('কী বাবদ (ঐচ্ছিক)', 'What for (optional)')} htmlFor="note">
          <input id="note" className={inputClass} value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isCredit ? t('যেমন: চাল ৫ কেজি', 'e.g. 5kg rice') : ''} />
        </Field>

        <Button type="submit" variant={isCredit ? 'primary' : 'success'} size="lg" fullWidth
          disabled={!Number(amount)}>
          {isCredit ? t('দিলাম', 'Gave') : t('পেলাম', 'Got')}
        </Button>
      </form>
    </div>
  );
}

const KhataParty = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, bn } = useLang();

  const [party, setParty] = useState(null);
  const [entries, setEntries] = useState([]);
  const [canRemind, setCanRemind] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getParty(id);
      setParty(data.party);
      setEntries(data.entries || []);
      setCanRemind(Boolean(data.canRemind));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const syncPending = useCallback(() => setPending(pendingForParty(id)), [id]);
  useEffect(() => { syncPending(); return onQueueChanged(syncPending); }, [syncPending]);

  // The same policy the front page uses. He is standing on THIS screen when
  // the signal comes back, so this is the one that has to work.
  const { drain } = useLedgerSync(load);

  const onVoid = async (entryId) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('এই লাইনটি বাতিল করবেন?', 'Cross out this line?'))) return;
    setBusy(true);
    try {
      await voidEntry(entryId, '');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onRemind = async () => {
    setBusy(true);
    try {
      await remindParty(id);
      toast.success(t('মনে করিয়ে দেওয়া হয়েছে।', 'Reminder sent.'));
      await load();
    } catch (err) {
      // The server's refusals here are RULES, not glitches — "he has already
      // paid", "you sent one this week". Show them verbatim.
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleOptIn = async () => {
    try {
      const res = await updateParty(id, { reminderOptIn: !party.reminder?.optIn });
      setParty(res.party);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  /**
   * The SECOND switch: let the server send these without him.
   *
   * Deliberately separate from the one above. "You may send this when I tap"
   * and "send this every week on my behalf, to a customer, forever" are
   * different promises, and the server refuses `reminderAuto` unless the first
   * is already on.
   */
  const toggleAuto = async () => {
    try {
      const res = await updateParty(id, { reminderAuto: !party.reminder?.auto });
      setParty(res.party);
      toast.success(res.party.reminder?.auto
        ? t('স্বয়ংক্রিয় রিমাইন্ডার চালু', 'Automatic reminders on')
        : t('স্বয়ংক্রিয় রিমাইন্ডার বন্ধ', 'Automatic reminders off'));
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <LoadingState />;
  if (error) {
    return <ErrorState message={error.message} onRetry={load} />;
  }

  const pendingDelta = pendingBalanceDelta(id);
  const balance = (party.balance || 0) + pendingDelta;
  const owes = balance > 0;

  return (
    // `pb-28` reserves room for the pinned দিলাম/পেলাম bar plus the phone's tab
    // bar. On desktop the tab bar is gone, so the reserve shrinks to just the
    // action bar.
    <div className="space-y-3 -mx-4 lg:mx-0 pb-28 lg:pb-24">
      {/* Header */}
      <div className="px-4 flex items-center gap-2">
        <button type="button" onClick={() => navigate('/khata')}
          className="w-11 h-11 -ml-2 rounded-xl flex items-center justify-center text-gray-600 active:scale-95"
          aria-label={t('পিছনে', 'Back')}>
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-gray-900 truncate">{party.name}</h1>
          {party.phone ? (
            <p className="text-sm text-gray-500">{bn ? toBnDigits(party.phone) : party.phone}</p>
          ) : null}
        </div>
        {party.phone ? (
          <a href={`tel:${party.phone}`}
            className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 active:scale-95"
            aria-label={t('কল করুন', 'Call')}>
            <Phone size={20} />
          </a>
        ) : null}
      </div>

      {/* The balance — never shown as a negative number */}
      <div className="px-4">
        <Card className={owes ? 'bg-emerald-50 border-emerald-200' : balance < 0 ? 'bg-crimson-50 border-crimson-100' : ''}>
          <p className="text-sm font-bold text-gray-600">
            {balance === 0 ? t('হিসাব মিটে গেছে', 'All settled')
              : owes ? t('আপনি পাবেন', "You'll get")
                : t('আপনি দেবেন', "You'll pay")}
          </p>
          <p className={`text-4xl font-bold tabular-nums mt-1 ${
            balance === 0 ? 'text-gray-400' : owes ? 'text-emerald-700' : 'text-[#ba0036]'
          }`}>
            {formatTaka(Math.abs(balance), bn)}
          </p>
          {pendingDelta !== 0 ? (
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-700 mt-2">
              <CloudOff size={13} />
              {t('কিছু এন্ট্রি এখনো সেভ হয়নি', 'Some entries not synced yet')}
            </p>
          ) : null}
        </Card>
      </div>

      {/* বিবরণী — opening, running balance, closing. The page he turns around
          to show the customer, kept separate from the list above because a
          running total only reads downwards and must not include lines the
          server has not accepted. */}
      <div className="px-4 pb-1">
        <Button variant="secondary" icon={FileText} fullWidth
          onClick={() => setStatementOpen(true)}>
          {t('বিবরণী দেখুন', 'View statement')}
        </Button>
      </div>

      {/* Reminder — only offered when the rules would actually allow it */}
      {party.phone && owes ? (
        <div className="px-4">
          {party.reminder?.optIn ? (
            <>
              <Button variant="secondary" icon={Send} fullWidth loading={busy}
                disabled={!canRemind} onClick={onRemind}
                title={canRemind ? '' : t('সম্প্রতি পাঠানো হয়েছে', 'Sent recently')}>
                {canRemind
                  ? t('বাকির কথা মনে করিয়ে দিন', 'Send a reminder')
                  : t('সম্প্রতি পাঠানো হয়েছে', 'Sent recently')}
              </Button>

              {/* Automatic sending — offered only after the manual consent
                  exists, and stated in full. He is agreeing on somebody else's
                  behalf, so the rules he is agreeing to are on the screen
                  rather than in a help page nobody opens. */}
              <button
                type="button"
                onClick={toggleAuto}
              className="w-full flex items-start gap-3 text-left px-4 py-3 mt-2.5 rounded-2xl bg-white border border-gray-200 active:scale-[0.99] transition-transform"
            >
              <span className={[
                'mt-0.5 w-10 h-6 shrink-0 rounded-full transition-colors relative',
                party.reminder?.auto ? 'bg-emerald-500' : 'bg-gray-300',
              ].join(' ')}>
                <span className={[
                  'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                  party.reminder?.auto ? 'translate-x-[18px]' : 'translate-x-0.5',
                ].join(' ')} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-gray-800">
                  {t('নিজে নিজে মনে করিয়ে দেবে', 'Remind automatically')}
                </span>
                <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">
                  {t('সপ্তাহে একবার, শুধু ১০০ টাকার বেশি বাকি থাকলে, আর দোকানে না এলে। বাকি মিটে গেলে বন্ধ।',
                     'Once a week, only above ৳100, and only if they have not been in. Stops when settled.')}
                  </span>
                </span>
              </button>
            </>
          ) : (
            <button type="button" onClick={toggleOptIn}
              className="w-full text-left px-4 py-3 rounded-2xl bg-white border border-gray-200 active:scale-[0.99] transition-transform">
              <span className="block text-sm font-bold text-gray-800">
                {t('এসএমএস/হোয়াটসঅ্যাপে মনে করিয়ে দেওয়া চালু করবেন?',
                   'Allow SMS/WhatsApp reminders?')}
              </span>
              <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">
                {t('সপ্তাহে একবারের বেশি নয়, আর বাকি মিটে গেলে কখনো নয়।',
                   'At most once a week, and never once they have paid.')}
              </span>
            </button>
          )}
        </div>
      ) : null}

      {/* The lines */}
      <div className="bg-white border-y lg:border lg:rounded-2xl lg:overflow-hidden border-gray-200">
        {/* Not-yet-synced entries sit at the top, visibly provisional. He wrote
            them, so he must see them — but he should also know they haven't
            left the phone. */}
        {pending.map((op) => (
          <div key={op.clientEntryId}
            className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 opacity-70">
            <CloudOff size={16} className="shrink-0 text-amber-600" />
            <span className="flex-1 min-w-0">
              <span className="block text-base font-bold text-gray-900">
                {op.payload.kind === 'credit' ? t('দিলাম', 'Gave') : t('পেলাম', 'Got')}
              </span>
              {op.payload.note ? (
                <span className="block text-sm text-gray-500 truncate">{op.payload.note}</span>
              ) : null}
            </span>
            <span className="text-base font-bold tabular-nums text-gray-700">
              {formatTaka(op.payload.amount, bn)}
            </span>
          </div>
        ))}

        {entries.map((e) => {
          const credit = e.kind === 'credit';
          const voided = Boolean(e.voidedAt);
          return (
            <div key={e.id}
              className={`flex items-center gap-3 px-4 py-3 border-b border-gray-100 ${voided ? 'opacity-50' : ''}`}>
              <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${
                credit ? 'bg-crimson-50 text-[#ba0036]' : 'bg-emerald-50 text-emerald-700'
              }`}>
                {credit ? '↑' : '↓'}
              </span>
              <span className="flex-1 min-w-0">
                <span className={`block text-base font-bold text-gray-900 ${voided ? 'line-through' : ''}`}>
                  {credit ? t('দিলাম', 'Gave') : t('পেলাম', 'Got')}
                </span>
                <span className="block text-sm text-gray-500 truncate">
                  {fmtDay(e.at, bn)}{e.note ? ` · ${e.note}` : ''}
                  {voided ? ` · ${t('বাতিল', 'crossed out')}` : ''}
                </span>
              </span>
              <span className={`text-base font-bold tabular-nums ${voided ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                {formatTaka(e.amount, bn)}
              </span>
              {!voided ? (
                <button type="button" onClick={() => onVoid(e.id)} disabled={busy}
                  className="w-9 h-9 shrink-0 flex items-center justify-center text-gray-400 active:scale-90"
                  aria-label={t('বাতিল করুন', 'Cross out')}>
                  <Undo2 size={17} />
                </button>
              ) : null}
            </div>
          );
        })}

        {!entries.length && !pending.length ? (
          <div className="px-4 py-12 text-center">
            <p className="text-base font-bold text-gray-700">
              {t('এখনো কোনো হিসাব নেই', 'No entries yet')}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {t('নিচের বোতাম দুটি দিয়ে শুরু করুন।', 'Use the two buttons below to start.')}
            </p>
          </div>
        ) : null}
      </div>

      {/* The two buttons. Pinned, thumb-height, always in the same place. */}
      <div
        /* `lg:left-64` clears the sidebar, which a full-width bar would
           otherwise run underneath. The 68px lift exists only to clear the
           phone's tab bar, so `lg:bottom-0` drops it — and the offset moved
           out of an inline style to get there, since an inline `bottom` wins
           against any breakpoint class. */
        className={[
          'fixed inset-x-0 lg:left-64 z-40 bg-white border-t border-gray-200 px-4 lg:px-8 py-3',
          'bottom-[calc(env(safe-area-inset-bottom,0px)+68px)] lg:bottom-0',
        ].join(' ')}
      >
        <div className="max-w-2xl mx-auto grid grid-cols-2 gap-2.5">
          <Button variant="primary" size="lg" onClick={() => setSheet('credit')}>
            {t('দিলাম', 'Gave')}
          </Button>
          <Button variant="success" size="lg" icon={Check} onClick={() => setSheet('payment')}>
            {t('পেলাম', 'Got')}
          </Button>
        </div>
      </div>

      <EntrySheet
        open={Boolean(sheet)}
        kind={sheet}
        party={party}
        onClose={() => setSheet(null)}
        onQueued={() => { syncPending(); drain(); }}
      />

      {statementOpen ? (
        <PartyStatement
          partyId={id}
          partyName={party.name}
          // Passed in so the statement can SAY what it is missing rather than
          // quietly leaving it out of a total a customer is being shown.
          pendingCount={pending.length}
          // Same consent as reminders — one permission, given once. Without it
          // the server refuses, so the button is not offered either.
          canSend={Boolean(party.phone && party.reminder?.optIn)}
          onClose={() => setStatementOpen(false)}
        />
      ) : null}
    </div>
  );
};

export default KhataParty;
