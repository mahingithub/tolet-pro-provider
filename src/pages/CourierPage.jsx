import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  MapPin, Navigation, CheckCircle2, Loader2, AlertTriangle, Radio,
} from 'lucide-react';

import { useLang, toBnDigits } from '../context/LanguageContext.jsx';
import { openTrack, ping, finish } from '../services/courierService.js';
import { Button, Card } from '../components/ui/index.js';

/**
 * CourierPage — /d/:token. The delivery boy's whole app.
 * ──────────────────────────────────────────────────────────────────────────
 * ─── WHO THIS IS FOR ─────────────────────────────────────────────────────────
 * A teenager on a bicycle with somebody else's Android phone, who got a link on
 * WhatsApp thirty seconds ago and has never heard of this company. He is not
 * logged in, will not log in, and will close this tab the moment the bag leaves
 * his hand.
 *
 * So: one screen, one button, no navigation, no login, nothing to learn. The
 * page does exactly two things — report where he is, and open his own maps app
 * when he taps নেভিগেট. It does NOT try to be a map: he already has Google Maps
 * and it works better than anything that would fit here.
 *
 * ─── IT ASKS FOR LOCATION IMMEDIATELY, AND THAT IS CORRECT HERE ──────────────
 * Everywhere else in this codebase a permission prompt on load is a mistake.
 * Here it is the entire purpose of the link — he opened it BECAUSE his boss told
 * him to share his location, so the prompt is the expected next thing rather
 * than an ambush. Waiting for a tap would just add a step he does not
 * understand the reason for.
 *
 * ─── WHY `watchPosition` AND NOT A TIMER ─────────────────────────────────────
 * The browser wakes us on real movement, which on a bicycle is far cheaper in
 * battery than polling GPS every ten seconds — and battery is the reason a
 * delivery boy closes a tracking page. Uploads are throttled separately, so a
 * fast-updating fix does not become a fast-updating network call.
 */

// How often a fix is actually SENT, however often the browser reports one.
const UPLOAD_EVERY_MS = 15_000;

const fmtDistance = (metres, bn) => {
  if (metres == null) return '—';
  if (metres >= 1000) {
    const km = (metres / 1000).toFixed(1);
    return bn ? `${toBnDigits(km)} কিমি` : `${km} km`;
  }
  return bn ? `${toBnDigits(metres)} মিটার` : `${metres} m`;
};

const CourierPage = () => {
  const { token } = useParams();
  const { t, bn } = useLang();

  const [track, setTrack] = useState(null);
  const [navUrl, setNavUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [done, setDone] = useState(false);

  const watchId = useRef(null);
  const lastUpload = useRef(0);

  useEffect(() => {
    let cancelled = false;
    openTrack(token)
      .then((data) => {
        if (cancelled) return;
        setTrack(data.track);
        setNavUrl(data.navigateUrl);
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const send = useCallback(async (pos) => {
    const now = Date.now();
    if (now - lastUpload.current < UPLOAD_EVERY_MS) return;
    lastUpload.current = now;
    try {
      const data = await ping(token, {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
      setTrack(data.track);
      setGeoError('');
    } catch (err) {
      // A dead link is the one failure worth showing — it means his boss ended
      // the delivery, and he should stop.
      if (err.status === 404) setError(err.message);
    }
  }, [token]);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError(t('এই ফোনে লোকেশন পাওয়া যাচ্ছে না।', 'Location is not available on this phone.'));
      return;
    }
    setSharing(true);
    // The first fix is forced through, so the shop sees him move off
    // immediately rather than after the first throttle window.
    lastUpload.current = 0;
    watchId.current = navigator.geolocation.watchPosition(
      send,
      (err) => {
        setGeoError(err.code === 1
          ? t('লোকেশন বন্ধ আছে — ব্রাউজারে অনুমতি দিন।', 'Location is off — allow it in your browser.')
          : t('লোকেশন পাওয়া যাচ্ছে না।', 'Cannot get a location fix.'));
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }, [send, t]);

  // Asked for on load — see the header note on why this is the one place that
  // is right.
  useEffect(() => {
    if (!track || done || error) return undefined;
    start();
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [track, done, error, start]);

  const handleDone = async () => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setSharing(false);
    setDone(true);
    await finish(token).catch(() => {});
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-gray-50">
        <AlertTriangle size={34} className="text-amber-500 mb-3" />
        <p className="text-lg font-bold text-gray-900">{error}</p>
        <p className="text-sm text-gray-600 mt-2 max-w-xs">
          {/* No retry button: there is nothing he can do, and offering one
              would have him tapping it on a roadside. */}
          {t('দোকানদারের কাছ থেকে নতুন লিংক নিন।', 'Ask the shop for a new link.')}
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-gray-50">
        <CheckCircle2 size={40} className="text-emerald-600 mb-3" />
        <p className="text-xl font-bold text-gray-900">{t('ধন্যবাদ!', 'Thank you!')}</p>
        <p className="text-sm text-gray-600 mt-2">
          {t('আপনি এই পেজটি বন্ধ করতে পারেন।', 'You can close this page now.')}
        </p>
      </div>
    );
  }

  const metres = track?.metresLeft;
  const arrived = track?.status === 'arrived';

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 flex flex-col gap-4 max-w-md mx-auto">
      <div className="text-center">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
          {t('ডেলিভারি', 'Delivery')}
        </p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">
          {track?.destination?.label || t('গ্রাহকের ঠিকানা', "Customer's address")}
        </h1>
      </div>

      {/* The one number that matters to him. */}
      <Card className="text-center py-7">
        <p className="text-sm font-bold text-gray-500">
          {arrived ? t('আপনি পৌঁছে গেছেন', "You've arrived") : t('আর কত দূর', 'Distance left')}
        </p>
        <p className={`text-5xl font-bold mt-1.5 tabular-nums ${
          arrived ? 'text-emerald-600' : 'text-gray-900'
        }`}
        >
          {arrived ? '✓' : fmtDistance(metres, bn)}
        </p>
      </Card>

      <a href={navUrl} target="_blank" rel="noreferrer" className="block">
        <Button variant="primary" size="lg" icon={Navigation} fullWidth>
          {t('নেভিগেট করুন', 'Navigate')}
        </Button>
      </a>

      {/* A status line, not a control. He should not have to think about
          whether "sharing" is on — the page does it, and this just says so. */}
      <div className={`flex items-center gap-2.5 rounded-2xl px-4 py-3 ${
        sharing && !geoError ? 'bg-emerald-50' : 'bg-amber-50'
      }`}
      >
        {sharing && !geoError ? (
          <Radio size={17} className="text-emerald-600 shrink-0 animate-pulse" />
        ) : (
          <MapPin size={17} className="text-amber-600 shrink-0" />
        )}
        <p className={`text-sm font-semibold ${
          sharing && !geoError ? 'text-emerald-800' : 'text-amber-800'
        }`}
        >
          {geoError || (sharing
            ? t('দোকান আপনার অবস্থান দেখতে পাচ্ছে', 'The shop can see where you are')
            : t('লোকেশন চালু করুন', 'Turn on location'))}
        </p>
      </div>

      {geoError ? (
        <Button variant="secondary" fullWidth onClick={start}>
          {t('আবার চেষ্টা করুন', 'Try again')}
        </Button>
      ) : null}

      <div className="flex-1" />

      <Button variant="success" size="lg" icon={CheckCircle2} fullWidth onClick={handleDone}>
        {t('পৌঁছে দিয়েছি', 'Delivered')}
      </Button>

      <p className="text-xs text-center text-gray-400 leading-relaxed">
        {/* Said plainly to somebody who did not choose to be tracked. It is his
            phone and his afternoon, and he should know exactly how much of it
            this page takes. */}
        {t('শুধু এই পেজ খোলা থাকা অবস্থায় আপনার অবস্থান দোকানে যায়। পৌঁছে দেওয়ার পর বন্ধ হয়ে যায়।',
           'Your location is shared only while this page is open. It stops when you mark it delivered.')}
      </p>
    </div>
  );
};

export default CourierPage;
