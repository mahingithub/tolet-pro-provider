import React, { useEffect, useState } from 'react';
import { LogOut, Globe, ShieldCheck, ShieldAlert, Bell, BellOff } from 'lucide-react';
import { toast } from 'sonner';

import { useProviderAuth } from '../context/ProviderAuthContext.jsx';
import { useLang } from '../context/LanguageContext.jsx';
import { Button, Card, Badge } from '../components/ui/index.js';
import * as push from '../services/pushService.js';

/**
 * Profile — identity, verification state, language, sign out.
 *
 * The verification row is the important one. An unverified provider is listed
 * and callable, just unbadged and ranked below verified peers — so this screen
 * has to make the badge feel like something worth earning rather than a
 * punishment for not having uploaded an NID yet.
 *
 * Coverage and hours editing still to build.
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
const Profile = () => {
  const { activeProvider, user, logout } = useProviderAuth();
  const { t, lang, setLang } = useLang();

  const verified = activeProvider?.isVerified;

  return (
    <div className="space-y-3">
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

      <Button variant="danger" icon={LogOut} fullWidth onClick={logout}>
        {t('লগ আউট', 'Sign out')}
      </Button>
    </div>
  );
};

export default Profile;
