import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ClipboardList, BookOpen, Tag, TrendingUp, User, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { useProviderAuth } from '../context/ProviderAuthContext.jsx';
import { useLang } from '../context/LanguageContext.jsx';
import { setOpenNow } from '../services/providerService.js';

/**
 * ProviderLayout — the shell.
 * ──────────────────────────────────────────────────────────────────────────
 * Five tabs and one switch. That is the whole app, and it is meant to stay
 * small: the measure of success here is that a shopkeeper can accept his first
 * order — and write his first খাতা entry — without anyone showing him how.
 *
 * There is no dashboard, no charts on the home screen, and no onboarding
 * carousel anywhere. Orders IS the home screen.
 *
 * The খোলা / বন্ধ switch sits in the header on every screen because it is the
 * single most important control in the app. A provider who cannot find it
 * starts declining orders he can't fill, collects decline counts he doesn't
 * understand, and then uninstalls.
 */

// FIVE tabs, against the "four, and a fifth needs an argument" rule set when
// this shell was built. The argument for খাতা:
//
// It is the only screen he opens on a day with no orders — which, in a new
// area, is most days for a while. The credit book is the habit that gets him
// into the app at all, and burying it under Profile would hide the one thing
// he already does every evening. Orders keeps the home slot because that is
// where a notification lands; খাতা sits immediately beside it.
const TABS = [
  { to: '/',         end: true,  Icon: ClipboardList, bn: 'অর্ডার',    en: 'Orders' },
  { to: '/khata',    end: false, Icon: BookOpen,      bn: 'খাতা',      en: 'Khata' },
  { to: '/listing',  end: false, Icon: Tag,           bn: 'দাম',       en: 'Prices' },
  { to: '/earnings', end: false, Icon: TrendingUp,    bn: 'আয়',        en: 'Earnings' },
  { to: '/profile',  end: false, Icon: User,          bn: 'প্রোফাইল',  en: 'Profile' },
];

function OpenClosedSwitch() {
  const { activeProvider, refreshProviders } = useProviderAuth();
  const { t } = useLang();
  const [saving, setSaving] = useState(false);

  if (!activeProvider) return null;
  const open = activeProvider.openNow;

  const toggle = async () => {
    setSaving(true);
    try {
      await setOpenNow(activeProvider.id, !open);
      await refreshProviders();
      toast.success(!open
        ? t('আপনি এখন খোলা', "You're now open")
        : t('আপনি এখন বন্ধ', "You're now closed"));
    } catch (err) {
      // Never leave the switch showing a state the server did not accept —
      // a provider who believes he is closed but is still receiving orders is
      // worse off than one who knows the toggle failed.
      toast.error(err.message || t('বদলানো গেল না', 'Could not change'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={saving}
      aria-pressed={open}
      className={[
        'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border font-bold text-sm transition-all active:scale-[0.97]',
        open
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-gray-100 border-gray-300 text-gray-600',
      ].join(' ')}
    >
      {saving
        ? <Loader2 size={15} className="animate-spin" />
        : <span className={`w-2.5 h-2.5 rounded-full ${open ? 'bg-emerald-500' : 'bg-gray-400'}`} />}
      {open ? t('খোলা', 'Open') : t('বন্ধ', 'Closed')}
    </button>
  );
}

const ProviderLayout = () => {
  const { activeProvider } = useProviderAuth();
  const { t } = useLang();

  return (
    <div className="min-h-screen bg-[#f4f6f8] flex flex-col">
      {/* Header — business name + the one switch */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#ba0036]">
              TO-LET PRO
            </p>
            <h1 className="text-base font-bold text-gray-900 truncate">
              {activeProvider?.name || t('সেবা প্রদানকারী', 'Provider')}
            </h1>
          </div>
          <OpenClosedSwitch />
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-4 pb-28">
        <Outlet />
      </main>

      {/* Bottom tabs. Fixed, thumb-height, with the safe-area inset so the
          labels clear the home indicator on a notched phone. */}
      <nav
        className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-2xl mx-auto grid grid-cols-5">
          {TABS.map(({ to, end, Icon, bn, en }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => [
                'flex flex-col items-center justify-center gap-1 py-2.5 min-h-tap transition-colors',
                isActive ? 'text-[#ba0036]' : 'text-gray-500',
              ].join(' ')}
            >
              {({ isActive }) => (
                <>
                  <Icon size={21} strokeWidth={isActive ? 2.4 : 1.9} />
                  <span className="text-xs font-bold">{t(bn, en)}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default ProviderLayout;
