import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardList, Phone, MapPin, Clock, RefreshCw, Truck, CheckCircle2, X,
  Navigation, Share2, Radio, Link2Off,
} from 'lucide-react';
import { toast } from 'sonner';

import { useProviderAuth } from '../context/ProviderAuthContext.jsx';
import { useLang, formatTaka, toBnDigits } from '../context/LanguageContext.jsx';
import {
  listRequests, acceptRequest, declineRequest, markOnTheWay, completeRequest,
  createDeliveryTrack, getDeliveryTrack, endDeliveryTrack,
} from '../services/providerService.js';
import { Button, Card, Badge, inputClass } from '../components/ui/index.js';
import LoadingState from '../components/common/LoadingState.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ErrorState from '../components/common/ErrorState.jsx';

/**
 * Orders — THE home screen.
 * ──────────────────────────────────────────────────────────────────────────
 * One list. Two buttons per row. Nothing else competes for attention.
 *
 * A `placed` row shows গ্রহণ / পারব না and a LIVE countdown to its 30-minute
 * response deadline, because after that the request expires, the tenant is told
 * nobody answered, and the silence counts against him — unlike an honest
 * decline, which costs him nothing. Making that deadline visible is the
 * difference between a rule that teaches and a rule that just punishes.
 *
 * ─── THE WHOLE LOOP LIVES HERE ───────────────────────────────────────────────
 *   placed     → গ্রহণ করুন / পারব না (with a reason)
 *   accepted   → রওনা দিয়েছি / সম্পন্ন
 *   on the way → সম্পন্ন
 *
 * Each button is the ONE next thing. There is no status dropdown, because a
 * dropdown asks him to know the state machine; a single button tells him.
 */

const STATUS_TONE = {
  placed:     { tone: 'warn',    bn: 'নতুন',          en: 'New' },
  accepted:   { tone: 'info',    bn: 'গ্রহণ করেছেন',  en: 'Accepted' },
  on_the_way: { tone: 'info',    bn: 'পথে',           en: 'On the way' },
  completed:  { tone: 'success', bn: 'সম্পন্ন',       en: 'Completed' },
  declined:   { tone: 'neutral', bn: 'নেননি',         en: 'Declined' },
  cancelled:  { tone: 'danger',  bn: 'বাতিল',         en: 'Cancelled' },
  expired:    { tone: 'danger',  bn: 'সময় শেষ',      en: 'Expired' },
};

const FILTERS = [
  { key: 'open',      bn: 'চলমান',   en: 'Open' },
  { key: 'completed', bn: 'সম্পন্ন', en: 'Done' },
  { key: 'declined',  bn: 'নেননি',   en: 'Declined' },
];

/**
 * Canned decline reasons, in the words a shopkeeper actually uses.
 *
 * The reason reaches the tenant VERBATIM, so a generic code would be worse
 * than useless — "declined" tells them nothing about whether to wait or ring
 * somebody else. These four cover almost every real case; the fifth is a text
 * box, because the list must never be a reason to send the wrong one.
 */
const DECLINE_REASONS = [
  { bn: 'স্টক নেই', en: 'Out of stock' },
  { bn: 'এখন ডেলিভারি দেওয়া যাবে না', en: 'Cannot deliver right now' },
  { bn: 'জায়গাটা অনেক দূরে', en: 'Too far away' },
  { bn: 'আজ দোকান বন্ধ', en: 'Closed today' },
];

function minutesLeft(respondBy) {
  if (!respondBy) return null;
  const ms = new Date(respondBy).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

/**
 * A bottom sheet. Deliberately not a `window.prompt`: on a phone that is a
 * system dialog with a tiny field and no Bengali keyboard affordance, and this
 * is the one place the provider writes something a customer will read.
 *
 * `z-[60]` matching the খাতা sheets, NOT z-50. The bottom tab bar is z-50 and
 * comes later in the DOM, so a sheet sharing its layer renders UNDERNEATH it —
 * which buried this sheet's send button behind the nav.
 *
 * The bottom padding clears the phone's home indicator for the same reason.
 */
function Sheet({ title, children, onClose }) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-[60] flex items-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={t('বন্ধ', 'Close')}
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-2xl mx-auto bg-white rounded-t-3xl p-5 space-y-4 shadow-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 -mr-2 flex items-center justify-center text-gray-500"
          >
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Metres between two points, the same haversine the server uses. */
function metresBetween(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}

function fmtDistance(metres, bn) {
  if (metres == null) return null;
  if (metres >= 1000) {
    const km = (metres / 1000).toFixed(1);
    return bn ? `${toBnDigits(km)} কিমি` : `${km} km`;
  }
  return bn ? `${toBnDigits(metres)} মিটার` : `${metres} m`;
}

/**
 * The delivery panel on an accepted order.
 *
 * Two jobs, in the order a shopkeeper needs them:
 *
 *   1. HOW FAR IS IT. Measured from his own shop pin to the customer's, before
 *      anybody leaves — that is what decides whether he sends the boy at all.
 *   2. WHERE HAS THE BOY GOT TO, once a link is live.
 *
 * The link is shared through WhatsApp because that is how he already tells the
 * boy where to go. There is no in-app messaging to the courier and there should
 * not be: he is not a user of this platform.
 */
function DeliveryPanel({ req, providerGeo, bn, t }) {
  const [track, setTrack] = useState(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await getDeliveryTrack(req.id);
      setTrack(data.track);
    } catch { /* a tracking panel must never break the order card */ }
  }, [req.id]);

  useEffect(() => { load(); }, [load]);

  // Only while somebody is actually moving. Polling a finished delivery all
  // evening costs a shopkeeper data he is paying for by the megabyte.
  useEffect(() => {
    if (!track?.isOpen || !track?.lastPoint) return undefined;
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [track?.isOpen, track?.lastPoint, load]);

  const dest = req.deliverTo || {};
  const hasPoint = dest.lat != null && dest.lng != null;
  const fromShop = hasPoint ? metresBetween(providerGeo, dest) : null;

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await createDeliveryTrack(req.id);
      setTrack(data.track);
      if (data.url) setUrl(data.url);
      else if (data.reused) {
        // Only the hash was kept, so the original link cannot be rebuilt. Said
        // plainly rather than handing him a different URL from the one already
        // in his WhatsApp thread.
        setError(t('লিংক আগেই পাঠানো হয়েছে — WhatsApp-এ দেখুন।',
          'A link was already sent — check your WhatsApp.'));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const share = () => {
    const text = t(`অর্ডার #${toBnDigits(req.code)} — ডেলিভারির লোকেশন চালু করুন:\n${url}`,
      `Order #${req.code} — share your delivery location:\n${url}`);
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const stop = async () => {
    setBusy(true);
    try {
      const data = await endDeliveryTrack(req.id);
      setTrack(data.track);
      setUrl('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-gray-50 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-gray-700">{t('ডেলিভারি', 'Delivery')}</span>
        {/* Shop → customer, before anybody leaves. This is the number that
            decides whether the order is worth sending somebody out for. */}
        {fromShop != null ? (
          <span className="text-sm font-bold text-gray-900">
            {t(`দোকান থেকে ${fmtDistance(fromShop, bn)}`, `${fmtDistance(fromShop, false)} from shop`)}
          </span>
        ) : null}
      </div>

      {!hasPoint ? (
        <p className="text-sm text-amber-800 bg-amber-50 rounded-xl px-3 py-2">
          {/* An order placed before the customer shared a pin has an address in
              words and nothing to measure. Say so rather than showing a blank. */}
          {t('ক্রেতা লোকেশন দেননি — ঠিকানা দেখে যান বা ফোন করুন।',
             'No location shared — go by the written address or call.')}
        </p>
      ) : (
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}`}
          target="_blank"
          rel="noreferrer"
          className="block"
        >
          <Button variant="secondary" icon={Navigation} fullWidth>
            {t('ম্যাপে দেখুন', 'Open in Maps')}
          </Button>
        </a>
      )}

      {track?.lastPoint ? (
        <div className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 ${
          track.status === 'arrived' ? 'bg-emerald-50' : 'bg-blue-50'
        }`}
        >
          <Radio size={15} className={`shrink-0 ${
            track.status === 'arrived' ? 'text-emerald-600' : 'text-blue-600 animate-pulse'
          }`}
          />
          <p className={`text-sm font-bold flex-1 ${
            track.status === 'arrived' ? 'text-emerald-800' : 'text-blue-800'
          }`}
          >
            {track.status === 'arrived'
              ? t('পৌঁছে গেছেন', 'Arrived')
              : t(`গ্রাহকের থেকে ${fmtDistance(track.metresLeft, bn)} দূরে`,
                  `${fmtDistance(track.metresLeft, false)} from the customer`)}
          </p>
        </div>
      ) : null}

      {hasPoint && !track?.isOpen ? (
        <Button variant="primary" icon={Share2} fullWidth loading={busy} onClick={create}>
          {t('ডেলিভারি লিংক তৈরি করুন', 'Create delivery link')}
        </Button>
      ) : null}

      {url ? (
        <>
          <Button variant="success" icon={Share2} fullWidth onClick={share}>
            {t('ডেলিভারি ম্যানকে পাঠান', 'Send to the delivery man')}
          </Button>
          <p className="text-xs text-gray-500 leading-relaxed">
            {t('লিংকটি খুললেই তার অবস্থান আপনি দেখতে পাবেন। লগইন লাগবে না।',
               'He just opens it — no login needed — and you can see where he is.')}
          </p>
        </>
      ) : null}

      {track?.isOpen ? (
        <Button variant="danger" icon={Link2Off} fullWidth loading={busy} onClick={stop}>
          {t('ট্র্যাকিং বন্ধ করুন', 'Stop tracking')}
        </Button>
      ) : null}

      {error ? <p className="text-xs font-semibold text-amber-700">{error}</p> : null}
    </div>
  );
}

function OrderCard({ req, onAccept, onDecline, onOnTheWay, onComplete, busy, providerGeo }) {
  const { t, bn } = useLang();
  const meta = STATUS_TONE[req.status] || STATUS_TONE.placed;

  // Re-rendered every 30s by the parent's tick, so the countdown is live rather
  // than frozen at whatever it said when the screen loaded. A deadline that
  // does not move is a deadline nobody believes.
  const left = req.status === 'placed' ? minutesLeft(req.respondBy) : null;

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-500">
            {t('অর্ডার', 'Order')} #{bn ? toBnDigits(req.code) : req.code}
          </p>
          <p className="text-base font-bold text-gray-900 truncate">{req.tenantName}</p>
        </div>
        <Badge tone={meta.tone}>{t(meta.bn, meta.en)}</Badge>
      </div>

      <ul className="space-y-1.5">
        {(req.items || []).map((item) => (
          <li key={item.rowKey} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-gray-800 font-semibold">
              {item.label}
              {item.qty > 1 ? (
                <span className="text-gray-500 font-normal">
                  {' '}× {bn ? toBnDigits(item.qty) : item.qty} {item.unit}
                </span>
              ) : null}
            </span>
            <span className="text-gray-900 font-bold tabular-nums shrink-0">
              {formatTaka(item.unitPrice * item.qty, bn)}
            </span>
          </li>
        ))}
      </ul>

      {req.quotedTotal ? (
        <div className="flex items-baseline justify-between border-t border-gray-100 pt-2.5">
          <span className="text-sm font-bold text-gray-600">{t('মোট', 'Total')}</span>
          <span className="text-lg font-bold text-gray-900 tabular-nums">
            {formatTaka(req.finalTotal ?? req.quotedTotal, bn)}
          </span>
        </div>
      ) : null}

      {req.deliverTo?.addressText ? (
        <p className="flex items-start gap-2 text-sm text-gray-600">
          <MapPin size={15} className="shrink-0 mt-0.5 text-gray-400" />
          <span>
            {req.deliverTo.addressText}
            {req.deliverTo.note ? <span className="text-gray-500"> · {req.deliverTo.note}</span> : null}
          </span>
        </p>
      ) : null}

      {req.note ? (
        <p className="text-sm bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-amber-900">
          {req.note}
        </p>
      ) : null}

      {/* The response deadline, shown plainly. Silence expires the order and
          counts against him; an honest decline does not. He should be able to
          see which one he is drifting toward. */}
      {left !== null ? (
        <p className={`flex items-center gap-1.5 text-xs font-bold ${
          left <= 5 ? 'text-red-600' : 'text-amber-700'
        }`}
        >
          <Clock size={13} />
          {left > 0
            ? t(`${toBnDigits(left)} মিনিটের মধ্যে উত্তর দিন`, `Respond within ${left} min`)
            : t('সময় প্রায় শেষ', 'Time almost up')}
        </p>
      ) : null}

      {req.status === 'placed' ? (
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <Button variant="danger" disabled={busy} onClick={() => onDecline(req)}>
            {t('পারব না', "Can't do it")}
          </Button>
          <Button variant="success" loading={busy} onClick={() => onAccept(req)}>
            {t('গ্রহণ করুন', 'Accept')}
          </Button>
        </div>
      ) : null}

      {/* Only once he has taken the order. Before that there is nothing to
          deliver and nobody to send. */}
      {['accepted', 'on_the_way'].includes(req.status) ? (
        <DeliveryPanel req={req} providerGeo={providerGeo} bn={bn} t={t} />
      ) : null}

      {/* One button per state: the ONE next thing, never a status picker that
          asks him to know the state machine. */}
      {req.status === 'accepted' ? (
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <Button variant="secondary" icon={Truck} disabled={busy} onClick={() => onOnTheWay(req)}>
            {t('রওনা দিয়েছি', 'On the way')}
          </Button>
          <Button variant="success" icon={CheckCircle2} disabled={busy} onClick={() => onComplete(req)}>
            {t('সম্পন্ন', 'Done')}
          </Button>
        </div>
      ) : null}

      {req.status === 'on_the_way' ? (
        <Button
          variant="success" icon={CheckCircle2} fullWidth
          loading={busy} onClick={() => onComplete(req)}
        >
          {t('পৌঁছে দিয়েছি', 'Delivered')}
        </Button>
      ) : null}

      {['accepted', 'on_the_way'].includes(req.status) && req.tenantPhone ? (
        <a href={`tel:${req.tenantPhone}`} className="block">
          <Button variant="secondary" icon={Phone} fullWidth>
            {t('কল করুন', 'Call')}
          </Button>
        </a>
      ) : null}
    </Card>
  );
}

const Orders = () => {
  const { activeProvider } = useProviderAuth();
  const { t, bn } = useLang();

  // The shop's own pin, for "how far is this order from here". Stored
  // [lng, lat] on the provider — the one ordering in this codebase that runs
  // the opposite way round to everything else.
  const shopPoint = useMemo(
    () => (activeProvider?.lat != null
      ? { lat: activeProvider.lat, lng: activeProvider.lng }
      : null),
    [activeProvider?.lat, activeProvider?.lng],
  );

  const [filter, setFilter] = useState('open');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Which order a sheet is open for, and what kind.
  const [declining, setDeclining] = useState(null);
  const [reasonText, setReasonText] = useState('');
  const [completing, setCompleting] = useState(null);
  const [finalTotal, setFinalTotal] = useState('');

  // Forces a re-render so every card's countdown moves. Cheap — the list is a
  // handful of rows — and it is the only thing on this screen that has to be
  // live.
  const [, setTick] = useState(0);
  const tickRef = useRef(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!activeProvider) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await listRequests({
        providerId: activeProvider.id,
        // 'open' is the server's own default (placed + accepted + on the way),
        // so it is sent as no status at all rather than as a made-up value.
        status: filter === 'open' ? undefined : filter,
      });
      setRequests(data.requests || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
    // Keyed on the ID, not on the whole provider object. Depending on the
    // object means this refetches every time ANY field on it changes — the
    // খোলা/বন্ধ toggle rewrites `openNow` on the same document, so flipping the
    // switch would reload the order list for no reason. And if a caller ever
    // hands back a fresh object per render, an object dependency turns this
    // effect into an infinite refetch loop.
  }, [activeProvider?.id, filter]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Two jobs on one timer: move the countdowns, and quietly re-fetch so a new
    // order appears without him pulling to refresh. There is no push channel to
    // a merchant — he is not a User and has no subscription — so the WhatsApp
    // message is what reaches him when the app is closed, and this poll is what
    // reaches him when it is open.
    tickRef.current = setInterval(() => {
      setTick((n) => n + 1);
      if (filter === 'open') load({ silent: true });
    }, 30_000);
    return () => clearInterval(tickRef.current);
  }, [filter, load]);

  const run = async (req, fn, okBn, okEn) => {
    setBusyId(req.id);
    try {
      await fn();
      toast.success(t(okBn, okEn));
      await load({ silent: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleAccept = (req) => run(
    req, () => acceptRequest(req.id), 'গ্রহণ করা হয়েছে', 'Accepted',
  );

  const handleOnTheWay = (req) => run(
    req, () => markOnTheWay(req.id), 'ক্রেতাকে জানানো হয়েছে', 'Customer notified',
  );

  const submitDecline = (reason) => {
    const req = declining;
    setDeclining(null);
    setReasonText('');
    return run(
      req, () => declineRequest(req.id, reason), 'জানিয়ে দেওয়া হয়েছে', 'Tenant notified',
    );
  };

  const submitComplete = () => {
    const req = completing;
    const typed = Number(finalTotal);
    setCompleting(null);
    setFinalTotal('');
    return run(
      req,
      // Blank means "the quoted total stood". Sending 0 would tell the server
      // the order was free.
      () => completeRequest(req.id, Number.isFinite(typed) && typed > 0 ? typed : null),
      'সম্পন্ন হিসেবে রাখা হলো', 'Marked done',
    );
  };

  // `role="tablist"` / `role="tab"` rather than bare buttons. It is what these
  // actually are, it gives a screen reader the selected state, and it stops a
  // filter labelled "সম্পন্ন" being indistinguishable from the ACTION labelled
  // "সম্পন্ন" on a card below it — to assistive tech and to anything else
  // querying by role.
  const tabs = (
    <div role="tablist" className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          role="tab"
          aria-selected={filter === f.key}
          onClick={() => setFilter(f.key)}
          className={[
            'px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap border transition',
            filter === f.key
              ? 'bg-[#ba0036] text-white border-transparent'
              : 'bg-white text-gray-600 border-gray-200',
          ].join(' ')}
        >
          {t(f.bn, f.en)}
        </button>
      ))}
    </div>
  );

  const body = () => {
    if (loading) return <LoadingState label={t('অর্ডার দেখছি…', 'Loading orders…')} />;
    if (error) return <ErrorState message={error.message} onRetry={load} />;

    if (!requests.length) {
      return (
        <EmptyState
          icon={ClipboardList}
          title={filter === 'open'
            ? t('এখন কোনো অর্ডার নেই', 'No orders right now')
            : t('এখানে কিছু নেই', 'Nothing here')}
          hint={filter !== 'open' ? null : activeProvider?.openNow
            ? t('আপনি খোলা আছেন — নতুন অর্ডার এলে এখানে দেখাবে।',
              "You're open — new orders will appear here.")
            : t('আপনি এখন বন্ধ। উপরের সুইচ চেপে খুলুন।',
              "You're closed. Tap the switch above to open.")}
          action={(
            <Button size="sm" icon={RefreshCw} onClick={() => load()}>
              {t('রিফ্রেশ', 'Refresh')}
            </Button>
          )}
        />
      );
    }

    // One column on a phone, two on a desktop. An order card is short and
    // self-contained, so the wide screen buys him more orders in view rather
    // than a longer line of text to read.
    return (
      <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4">
        {requests.map((req) => (
          <OrderCard
            key={req.id}
            req={req}
            providerGeo={shopPoint}
            busy={busyId === req.id}
            onAccept={handleAccept}
            onDecline={setDeclining}
            onOnTheWay={handleOnTheWay}
            onComplete={setCompleting}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {tabs}
      {body()}

      {declining ? (
        <Sheet
          title={t('কেন নিতে পারছেন না?', "Why can't you take it?")}
          onClose={() => { setDeclining(null); setReasonText(''); }}
        >
          {/* The reason reaches the customer word for word. Said out loud here,
              because a shopkeeper typing "না" into a box he thinks is internal
              is a customer reading "না". */}
          <p className="text-sm text-gray-600 -mt-1">
            {t('ক্রেতা আপনার লেখাটাই দেখবেন।', 'The customer sees exactly what you write.')}
          </p>
          <div className="space-y-2">
            {DECLINE_REASONS.map((r) => (
              <Button
                key={r.en}
                variant="secondary"
                fullWidth
                onClick={() => submitDecline(bn ? r.bn : r.en)}
              >
                {t(r.bn, r.en)}
              </Button>
            ))}
          </div>
          <div className="space-y-2 pt-1">
            <input
              className={inputClass}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder={t('অন্য কারণ লিখুন', 'Write another reason')}
            />
            <Button
              variant="danger"
              fullWidth
              disabled={!reasonText.trim()}
              onClick={() => submitDecline(reasonText.trim())}
            >
              {t('পাঠান', 'Send')}
            </Button>
          </div>
        </Sheet>
      ) : null}

      {completing ? (
        <Sheet
          title={t('কত টাকা নিলেন?', 'How much did you take?')}
          onClose={() => { setCompleting(null); setFinalTotal(''); }}
        >
          <p className="text-sm text-gray-600 -mt-1">
            {t(
              `অর্ডারের হিসাব ছিল ${formatTaka(completing.quotedTotal, bn)}। আলাদা হলে লিখুন, না হলে খালি রাখুন।`,
              `The order quoted ${formatTaka(completing.quotedTotal, false)}. Enter the real amount, or leave blank.`,
            )}
          </p>
          <input
            className={inputClass}
            inputMode="numeric"
            value={finalTotal}
            onChange={(e) => setFinalTotal(e.target.value.replace(/[^\d]/g, ''))}
            placeholder={String(completing.quotedTotal || '')}
          />
          <Button variant="success" fullWidth icon={CheckCircle2} onClick={submitComplete}>
            {t('সম্পন্ন', 'Done')}
          </Button>
        </Sheet>
      ) : null}
    </div>
  );
};

export default Orders;
