import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, UserPlus, BookOpen, CloudOff, ShoppingCart, Wallet, X,
} from 'lucide-react';
import { toast } from 'sonner';

import { useLang, toBnDigits, formatTaka } from '../context/LanguageContext.jsx';
import {
  getSummary, listParties, createParty, newClientEntryId,
} from '../services/ledgerService.js';
import { enqueue, pendingBalanceDelta } from '../services/ledgerQueue.js';
import { useLedgerSync } from '../hooks/useLedgerSync.js';
import { Button, Card, Field, inputClass } from '../components/ui/index.js';
import LoadingState from '../components/common/LoadingState.jsx';
import ErrorState from '../components/common/ErrorState.jsx';

/**
 * খাতা — the credit book's front page.
 * ──────────────────────────────────────────────────────────────────────────
 * One number at the top (পাবেন), one list underneath (who owes what), one
 * button to add somebody. That is the paper book's first page and it is this
 * screen's entire job.
 *
 * পাবেন and দেবেন are shown SEPARATELY, never netted. They are two facts a
 * shopkeeper acts on differently, and a single net figure hides both.
 *
 * Bengali numerals throughout: a Latin "১২৪০০" next to Bangla words is the
 * kind of small wrongness this audience notices immediately.
 */

function BalanceRow({ party, pendingDelta, onOpen }) {
  const { t, bn } = useLang();
  // The queue's not-yet-synced entries count toward what he sees. If he just
  // wrote ৳৫০০ and the network is down, the page must already say so.
  const balance = (party.balance || 0) + pendingDelta;
  const owes = balance > 0;
  const settled = balance === 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(party)}
      className="w-full flex items-center gap-3 px-4 py-3.5 bg-white border-b border-gray-100 text-left active:bg-gray-50 transition-colors min-h-tap"
    >
      <span className="w-11 h-11 shrink-0 rounded-full bg-gray-100 flex items-center justify-center text-lg font-bold text-gray-500">
        {party.name?.trim()?.[0] || '?'}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-base font-bold text-gray-900 truncate">{party.name}</span>
        {party.phone ? (
          <span className="block text-sm text-gray-500 truncate">
            {bn ? toBnDigits(party.phone) : party.phone}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-right">
        <span className={`block text-base font-bold tabular-nums ${
          settled ? 'text-gray-400' : owes ? 'text-emerald-700' : 'text-[#ba0036]'
        }`}>
          {formatTaka(Math.abs(balance), bn)}
        </span>
        <span className="block text-xs font-bold text-gray-500">
          {settled ? t('মিটে গেছে', 'settled')
            : owes ? t('পাবেন', "you'll get")
              : t('দেবেন', "you'll pay")}
        </span>
      </span>
    </button>
  );
}

/** Add a person. Two fields, and only the first is required. */
function AddPartySheet({ open, onClose, onAdded }) {
  const { t } = useLang();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await createParty({ name: name.trim(), phone: phone.trim() });
      if (res.existing) {
        // The server hands back the existing page rather than a rival one.
        // Say so, or he wonders why his new entry went somewhere unexpected.
        toast.info(t('এই নম্বরে আগে থেকেই একটি খাতা আছে — সেটিই খোলা হলো।',
          'A page already exists for this number — opening it.'));
      }
      setName(''); setPhone('');
      onAdded(res.party);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label={t('বন্ধ', 'Close')} />
      <form
        onSubmit={submit}
        className="relative w-full bg-white rounded-t-3xl p-5 space-y-4 max-w-2xl mx-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{t('নতুন খাতা', 'New page')}</h2>
          <button type="button" onClick={onClose} className="w-10 h-10 -mr-2 flex items-center justify-center text-gray-500">
            <X size={22} />
          </button>
        </div>

        <Field label={t('নাম', 'Name')} htmlFor="pname" required>
          <input id="pname" autoFocus className={inputClass} value={name}
            onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field
          label={t('মোবাইল নম্বর', 'Mobile number')}
          htmlFor="pphone"
          // Optional, and it must LOOK optional. He knows "চায়ের দোকানের রহিম"
          // and may have no number; demanding one stops the entry he came for.
          hint={t('না থাকলে খালি রাখুন', 'Leave blank if you don\'t have it')}
        >
          <input id="pphone" type="tel" inputMode="numeric" className={inputClass}
            placeholder="01XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>

        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}
          disabled={!name.trim()}>
          {t('যোগ করুন', 'Add')}
        </Button>
      </form>
    </div>
  );
}

/** বিক্রি / খরচ — the daily cash page, with nobody attached. */
function CashSheet({ open, kind, onClose, onSaved }) {
  const { t } = useLang();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const isSale = kind === 'sale';

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 1) return;

    // Queued, not awaited. He is mid-sale; the entry is his the moment he taps.
    enqueue({
      clientEntryId: newClientEntryId(),
      payload: {
        kind, amount: Math.round(n), note: note.trim(),
        clientEntryId: undefined,
      },
    });
    onSaved();
    setAmount(''); setNote('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label={t('বন্ধ', 'Close')} />
      <form
        onSubmit={submit}
        className="relative w-full bg-white rounded-t-3xl p-5 space-y-4 max-w-2xl mx-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}
      >
        <h2 className="text-lg font-bold text-gray-900">
          {isSale ? t('আজকের বিক্রি', "Today's sale") : t('আজকের খরচ', "Today's expense")}
        </h2>

        <Field label={t('কত টাকা', 'How much')} htmlFor="camt" required>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-gray-400">৳</span>
            <input
              id="camt" type="number" inputMode="numeric" min="1" autoFocus
              value={amount} onChange={(e) => setAmount(e.target.value)}
              className={`${inputClass} pl-11 text-2xl font-bold tabular-nums h-16`}
            />
          </div>
        </Field>

        <Field label={t('কী বাবদ (ঐচ্ছিক)', 'What for (optional)')} htmlFor="cnote">
          <input id="cnote" className={inputClass} value={note}
            onChange={(e) => setNote(e.target.value)} />
        </Field>

        <Button type="submit" variant={isSale ? 'success' : 'primary'} size="lg" fullWidth
          disabled={!Number(amount)}>
          {t('সেভ করুন', 'Save')}
        </Button>
      </form>
    </div>
  );
}

const Khata = () => {
  const navigate = useNavigate();
  const { t, bn } = useLang();

  const [summary, setSummary] = useState(null);
  const [parties, setParties] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [cashKind, setCashKind] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, p] = await Promise.all([getSummary(), listParties({ q })]);
      setSummary(s);
      setParties(p.parties || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { load(); }, [load]);

  // One drain policy, shared with the party page — see useLedgerSync.
  const { pending, drain } = useLedgerSync(load);

  if (loading) return <LoadingState label={t('খাতা খুলছি…', 'Opening your book…')} />;
  if (error) {
    return (
      <ErrorState
        message={error.status === 404
          ? t('খাতা সার্ভিস এখনো চালু হয়নি।', 'The ledger API is not live yet.')
          : error.message}
        onRetry={load}
      />
    );
  }

  return (
    <div className="space-y-3 -mx-4">
      {/* পাবেন / দেবেন — split, never netted */}
      <div className="px-4">
        <Card className="bg-gradient-to-br from-[#ba0036] to-[#7d0025] border-0 text-white">
          <p className="text-sm font-bold text-white/70">{t('মোট পাবেন', "Total you'll get")}</p>
          <p className="text-4xl font-bold tabular-nums mt-1">
            {formatTaka(summary?.willReceive || 0, bn)}
          </p>
          <p className="text-sm font-bold text-white/70 mt-1">
            {t(`${toBnDigits(summary?.owing || 0)} জনের কাছে`,
               `from ${summary?.owing || 0} people`)}
          </p>
          {summary?.willPay > 0 ? (
            <p className="text-sm font-bold text-white/90 mt-3 pt-3 border-t border-white/20">
              {t('আপনি দেবেন', "You'll pay")}: {formatTaka(summary.willPay, bn)}
            </p>
          ) : null}
        </Card>
      </div>

      {/* Today's cash page */}
      <div className="px-4 grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => setCashKind('sale')}
          className="flex flex-col items-start gap-1 p-3.5 rounded-2xl bg-white border border-gray-200 active:scale-[0.98] transition-transform min-h-tap">
          <span className="flex items-center gap-1.5 text-xs font-bold text-gray-500">
            <ShoppingCart size={14} /> {t('আজকের বিক্রি', "Today's sale")}
          </span>
          <span className="text-lg font-bold text-gray-900 tabular-nums">
            {formatTaka(summary?.today?.sale || 0, bn)}
          </span>
        </button>
        <button type="button" onClick={() => setCashKind('expense')}
          className="flex flex-col items-start gap-1 p-3.5 rounded-2xl bg-white border border-gray-200 active:scale-[0.98] transition-transform min-h-tap">
          <span className="flex items-center gap-1.5 text-xs font-bold text-gray-500">
            <Wallet size={14} /> {t('আজকের খরচ', "Today's expense")}
          </span>
          <span className="text-lg font-bold text-gray-900 tabular-nums">
            {formatTaka(summary?.today?.expense || 0, bn)}
          </span>
        </button>
      </div>

      {/* Unsynced entries — stated plainly, never as an error. Nothing is lost;
          it just hasn't reached the server yet. */}
      {pending > 0 ? (
        <div className="mx-4 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-sm font-bold text-amber-900">
          <CloudOff size={16} className="shrink-0" />
          {t(`${toBnDigits(pending)}টি এন্ট্রি সেভ হওয়ার অপেক্ষায় — নেট এলে চলে যাবে।`,
             `${pending} entries waiting to sync — they'll go when you're online.`)}
        </div>
      ) : null}

      {/* Search */}
      <div className="px-4 relative">
        <Search size={18} className="absolute left-7 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('নাম খুঁজুন', 'Search a name')}
          className={`${inputClass} pl-11`}
        />
      </div>

      {/* The book */}
      {parties.length ? (
        <div className="bg-white border-y border-gray-200">
          {parties.map((p) => (
            <BalanceRow
              key={p.id}
              party={p}
              pendingDelta={pendingBalanceDelta(p.id)}
              onOpen={(party) => navigate(`/khata/${party.id}`)}
            />
          ))}
        </div>
      ) : (
        <div className="px-4 py-12 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400">
            <BookOpen size={26} />
          </div>
          <p className="text-base font-bold text-gray-800">
            {q ? t('কাউকে পাওয়া যায়নি', 'Nobody found')
              : t('খাতা এখনো খালি', 'Your book is empty')}
          </p>
          <p className="text-sm text-gray-500 max-w-xs mx-auto leading-relaxed">
            {q ? t('অন্য নামে খুঁজে দেখুন।', 'Try another name.')
              : t('যাকে বাকি দেন তার নাম যোগ করুন — তারপর দিলাম / পেলাম লিখতে থাকুন।',
                  'Add someone you give credit to, then record দিলাম / পেলাম.')}
          </p>
        </div>
      )}

      {/* Add a person. Fixed, above the tab bar, always in the same place. */}
      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="fixed right-4 z-40 w-14 h-14 rounded-full bg-[#ba0036] text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}
        aria-label={t('নতুন খাতা', 'New page')}
      >
        <UserPlus size={24} />
      </button>

      <AddPartySheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={(party) => { setAddOpen(false); navigate(`/khata/${party.id}`); }}
      />
      <CashSheet
        open={Boolean(cashKind)}
        kind={cashKind}
        onClose={() => setCashKind(null)}
        onSaved={drain}
      />
    </div>
  );
};

export default Khata;
