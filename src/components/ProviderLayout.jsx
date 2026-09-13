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
    <div className="min-h-screen bg-[#f4f6f8]">
      {/* ─── Sidebar, desktop only ────────────────────────────────────────────
          The same five destinations as the phone's tab bar, not a different
          information architecture. A shopkeeper who learns the app on his
          phone and then opens it on the shop counter's PC should recognise it
          immediately — the layout changes, the vocabulary does not. */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 bg-white border-r border-gray-200 z-40">
        <div className="px-5 py-5 border-b border-gray-100">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#ba0036]">
            TO-LET PRO SERVICES
          </p>
          <h1 className="text-lg font-bold text-gray-900 truncate mt-0.5">
            {activeProvider?.name || t('সেবা প্রদানকারী', 'Provider')}
          </h1>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {TABS.map(({ to, end, Icon, bn, en }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => [
                'flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-bold transition-colors min-h-tap',
                isActive
                  ? 'bg-crimson-50 text-[#ba0036]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              ].join(' ')}
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} strokeWidth={isActive ? 2.4 : 1.9} />
                  {t(bn, en)}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* The one switch keeps its own corner here rather than riding in a
            header, so it is in a fixed place on both layouts. */}
        <div className="px-3 py-4 border-t border-gray-100">
          <OpenClosedSwitch />
        </div>
      </aside>

      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Header — phone only. On desktop its two jobs (who am I, am I open)
            belong to the sidebar, and repeating them would just eat the top of
            every screen. */}
        <header className="lg:hidden sticky top-0 z-40 bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#ba0036]">
                TO-LET PRO SERVICES
              </p>
              <h1 className="text-base font-bold text-gray-900 truncate">
                {activeProvider?.name || t('সেবা প্রদানকারী', 'Provider')}
              </h1>
            </div>
            <OpenClosedSwitch />
          </div>
        </header>

        {/* `pb-28` clears the fixed tab bar on a phone; there is no tab bar on
            desktop, so the padding goes with it. */}
        <main className="flex-1 w-full max-w-2xl lg:max-w-5xl mx-auto px-4 lg:px-8 py-4 lg:py-8 pb-28 lg:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Bottom tabs — phone only. Fixed, thumb-height, with the safe-area
          inset so the labels clear the home indicator on a notched phone. */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200"
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
