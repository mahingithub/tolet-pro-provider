import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';

/**
 * LanguageContext — Bangla first, and Bangla by default.
 * ──────────────────────────────────────────────────────────────────────────
 * The public app ships an en/bn toggle and defaults to whatever the tenant
 * picked. This app does NOT default to English, ever.
 *
 * The audience is a গ্যাস সাপ্লায়ার, a মুদি দোকানদার, a গৃহকর্মী. An English
 * first run is a wall before the first tap, and the sort of wall that gets an
 * app uninstalled rather than translated. English stays available — some
 * younger shop owners prefer it, and it is useful for support — but it is
 * opt-in, buried in Profile, and never the first thing anyone sees.
 *
 * `t()` takes the pair inline rather than reading a key from a bundle. With
 * roughly six screens, an indirection layer would cost more than it saves, and
 * inline pairs keep the Bangla visible in the component you are editing —
 * which is how it stays reviewable by someone who actually speaks it.
 */

const KEY = 'toletpro_provider:lang';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      return saved === 'en' ? 'en' : 'bn';   // anything unset or odd → Bangla
    } catch {
      return 'bn';
    }
  });

  const setLang = useCallback((next) => {
    const v = next === 'en' ? 'en' : 'bn';
    setLangState(v);
    try { window.localStorage.setItem(KEY, v); } catch { /* ignore */ }
  }, []);

  const value = useMemo(() => ({
    lang,
    bn: lang === 'bn',
    setLang,
    /** t('বাংলা', 'English') */
    t: (bnText, enText) => (lang === 'bn' ? bnText : (enText ?? bnText)),
  }), [lang, setLang]);

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used inside <LanguageProvider>');
  return ctx;
}

/**
 * Bengali numerals for display. A provider reading "১২ কেজি — ১৪৫০ টাকা"
 * should not have the price arrive in Latin digits next to a Bangla label.
 * Display only — never feed the result back into a number input.
 */
const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBnDigits(value) {
  return String(value ?? '').replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

/** `৳ ১,৪৫০` in Bangla, `৳ 1,450` in English. */
export function formatTaka(amount, bn = true) {
  const n = Number(amount) || 0;
  const grouped = n.toLocaleString(bn ? 'bn-BD' : 'en-IN');
  return `৳ ${grouped}`;
}
