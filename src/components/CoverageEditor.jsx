import React, { useMemo, useState } from 'react';
import { Check, MapPin, Search, X } from 'lucide-react';

import { useLang, toBnDigits } from '../context/LanguageContext.jsx';
import { useThanas } from '../hooks/useThanas.js';
import LoadingState from './common/LoadingState.jsx';
import ErrorState from './common/ErrorState.jsx';

/**
 * CoverageEditor — "কতদূর পর্যন্ত সেবা দেন?", asked two different ways.
 * ──────────────────────────────────────────────────────────────────────────
 * A category declares which question its trade actually answers, and they are
 * not the same shape:
 *
 *   radius  a gas van, a plumber, a মুদি দোকান — "৩ কিমি পর্যন্ত যাই".
 *           One tap on a ladder the category itself supplies (শিফটিং offers
 *           5/10/20 because a mover who only goes 5 km is not a mover).
 *   areas   an ISP, a গৃহকর্মী — "এই থানাগুলোতে কাজ করি". A distance means
 *           nothing here: an ISP has cable in some neighbourhoods and none in
 *           the next street, and a গৃহকর্মী works where she can get to, which
 *           is a list of places and not a circle.
 *
 * ─── WHY THIS SCREEN IS NOT OPTIONAL FOR `areas` ─────────────────────────────
 * `coverage.thanas` is what the tenant-facing query matches an areas provider
 * on. An empty list is not "serves everywhere" — it is `$in: [thana, []]`,
 * false for every tenant whose thana we know, which is every tenant who used
 * the location picker. A provider who walked past this step would be live, fee
 * paid, and unfindable, with nothing to tell him so. Hence the caller gates
 * its Next on `isCoverageComplete()`, and the server refuses the submit too.
 *
 * ─── THE LIST IS THE TENANT'S LIST ───────────────────────────────────────────
 * Fetched from GET /api/geo/thanas, which is generated from the same source as
 * the tenant's LocationBar. Offering him a spelling a tenant cannot search for
 * would reproduce the bug with extra steps.
 */

// The server's cap (utils/thanaNames.js). Stated here only so the UI can stop
// him at the same number rather than silently dropping his 51st tap.
export const MAX_THANAS = 50;

// Last-resort radius ladder, used only if the server's `meta` is missing — an
// older build, or a response that arrived without it. The real lists live in
// config/serviceCategories.js (a category's own `coverageOptions`, else the
// shared `COVERAGE_OPTIONS`) and are served alongside the categories. This
// copy exists so the step can never render with no buttons on it, which is a
// wizard nobody can finish.
export const FALLBACK_COVERAGE = [
  { km: 1.5, bn: 'এই এলাকা (১.৫ কিমি)', en: 'This area (1.5 km)' },
  { km: 3,   bn: '৩ কিলোমিটার',          en: '3 km' },
  { km: 5,   bn: '৫ কিলোমিটার',          en: '5 km' },
];

// How many rows to render at once. The full list is ~590 and a phone scrolling
// 590 DOM nodes is a phone that stutters; the search box is the way through it.
const PAGE = 40;

const norm = (s) => String(s || '').toLowerCase().trim();

/** Is this coverage answer complete enough to be findable? */
export function isCoverageComplete(coverage) {
  if (!coverage) return false;
  if (coverage.mode === 'areas') return (coverage.thanas || []).length > 0;
  return Number(coverage.radiusKm) > 0;
}

/**
 * One line a provider can read back: "৩ কিমি" or "৪টি এলাকা".
 * Used by the submit summary, which has no business re-deriving it.
 *
 * Named areas come back in whatever spelling is STORED, which is the canonical
 * English label. Render <CoverageSummary> instead wherever a Bengali reader
 * will see it — this plain-string form is for tests and for callers that
 * cannot mount a component.
 */
export function coverageSummary(coverage, { t, bn }) {
  if (!coverage) return '';
  if (coverage.mode === 'areas') {
    const n = (coverage.thanas || []).length;
    if (!n) return t('এলাকা বাছাই করা হয়নি', 'No areas chosen');
    // Under four, name them — a provider checking his own registration wants
    // to see the places, not a count of them.
    if (n <= 3) return (coverage.thanas || []).join(', ');
    return t(`${toBnDigits(n)}টি এলাকা`, `${n} areas`);
  }
  const km = coverage.radiusKm;
  if (!km) return '';
  return `${bn ? toBnDigits(km) : km} ${t('কিমি', 'km')}`;
}

/**
 * The names, in the language he is reading.
 *
 * Its own component because it needs the thana list, and the list is a 126 kB
 * fetch: a radius provider must never pay for it, and neither must someone who
 * picked more areas than we are going to spell out. Mounting this only in the
 * ≤3 case keeps that promise without a conditional hook.
 */
function NamedAreas({ names }) {
  const { t } = useLang();
  const { thanas } = useThanas();
  return names
    .map((name) => {
      const th = thanas.find((x) => norm(x.en) === norm(name));
      return th ? t(th.bn, th.en) : name;
    })
    .join(', ');
}

/**
 * <CoverageSummary> — the same line, but bilingual.
 *
 * `coverage.thanas` holds canonical English labels, because that is the one
 * spelling both the provider's list and the tenant's search are folded onto.
 * Printing them raw put "Mugda, Dhanmondi" in the middle of a Bangla sentence
 * on the submit screen — exactly the kind of small wrongness this audience
 * reads as the app not really being for them.
 */
export function CoverageSummary({ coverage }) {
  const { t, bn } = useLang();
  const names = coverage?.mode === 'areas' ? (coverage.thanas || []) : null;

  if (names && names.length && names.length <= 3) return <NamedAreas names={names} />;
  return <>{coverageSummary(coverage, { t, bn })}</>;
}

// ─── radius ──────────────────────────────────────────────────────────────────

function RadiusLadder({ options, value, onPick }) {
  const { t } = useLang();
  return (
    <div className="grid gap-2.5">
      {options.map((opt) => {
        const active = value === opt.km;
        return (
          <button
            key={opt.km}
            type="button"
            onClick={() => onPick(opt.km)}
            className={[
              'flex items-center justify-between px-4 py-4 rounded-xl border text-base font-bold min-h-tap transition-all active:scale-[0.98]',
              active ? 'bg-crimson-50 border-[#ba0036] text-[#ba0036]' : 'bg-white border-gray-300 text-gray-800',
            ].join(' ')}
          >
            {t(opt.bn, opt.en)}
            {active ? <Check size={18} /> : null}
          </button>
        );
      })}
    </div>
  );
}

// ─── areas ───────────────────────────────────────────────────────────────────

function ThanaPicker({ selected, onToggle }) {
  const { t, bn } = useLang();
  const { thanas, loading, error, retry } = useThanas();
  const [q, setQ] = useState('');

  const chosen = useMemo(() => new Set(selected.map(norm)), [selected]);
  const full = selected.length >= MAX_THANAS;

  const matches = useMemo(() => {
    const needle = q.trim();
    if (!needle) return thanas.slice(0, PAGE);
    const lower = needle.toLowerCase();
    return thanas
      .filter((th) => th.en.toLowerCase().includes(lower)
        || th.bn.includes(needle)
        || th.districtEn.toLowerCase().includes(lower)
        || th.districtBn.includes(needle))
      .slice(0, PAGE);
  }, [q, thanas]);

  if (loading) return <LoadingState />;
  if (error) {
    return (
      <ErrorState
        message={t('এলাকার তালিকা আনা গেল না।', 'Could not load the area list.')}
        onRetry={retry}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* What he has picked, always on screen. Scrolling back up a 40-row list
          to check whether মোহাম্মদপুর went in is how people tap it twice. */}
      {selected.length ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((name) => {
            const th = thanas.find((x) => norm(x.en) === norm(name));
            return (
              <button
                key={name}
                type="button"
                onClick={() => onToggle(name)}
                className="inline-flex items-center gap-1.5 pl-3 pr-2 py-2 rounded-full bg-crimson-50 border border-[#ba0036] text-sm font-bold text-[#ba0036] active:scale-95 transition-transform"
              >
                {th ? t(th.bn, th.en) : name}
                <X size={15} />
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-200 focus-within:border-[#ba0036] focus-within:ring-4 focus-within:ring-[#ba0036]/10 transition">
        <Search size={16} className="text-gray-400 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('থানা খুঁজুন', 'Search thana')}
          className="flex-1 bg-transparent outline-none text-base font-bold text-gray-900 placeholder:text-gray-400 placeholder:font-medium"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label={t('মুছুন', 'Clear')}
            className="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center text-gray-400"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      {full ? (
        <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {t(`সর্বোচ্চ ${toBnDigits(MAX_THANAS)}টি এলাকা বাছাই করা যায়।`,
             `You can choose at most ${MAX_THANAS} areas.`)}
        </p>
      ) : null}

      <div className="rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        {matches.map((th) => {
          const active = chosen.has(norm(th.en));
          return (
            <button
              key={`${th.districtEn}-${th.en}`}
              type="button"
              // A full list still lets him REMOVE, just not add.
              disabled={full && !active}
              onClick={() => onToggle(th.en)}
              className={[
                'w-full flex items-center gap-3 px-3.5 py-3.5 text-left min-h-tap transition-colors disabled:opacity-40',
                active ? 'bg-crimson-50' : 'bg-white',
              ].join(' ')}
            >
              <MapPin size={16} className={active ? 'text-[#ba0036] shrink-0' : 'text-gray-300 shrink-0'} />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold text-gray-900 truncate">
                  {t(th.bn, th.en)}
                </span>
                <span className="block text-xs font-bold text-gray-400 truncate">
                  {t(th.districtBn, th.districtEn)}
                </span>
              </span>
              {active ? <Check size={18} className="text-[#ba0036] shrink-0" /> : null}
            </button>
          );
        })}

        {!matches.length ? (
          <p className="text-center text-sm font-bold text-gray-400 py-8">
            {t('কিছু পাওয়া যায়নি', 'No match')}
          </p>
        ) : null}
      </div>

      {!q && thanas.length > PAGE ? (
        <p className="text-xs text-gray-500">
          {t('আপনার এলাকা না দেখলে উপরে খুঁজুন।', 'Not listed? Search above.')}
        </p>
      ) : null}

      {/* bn digits — a Latin "4" inside a Bangla sentence is exactly the small
          wrongness this audience notices. */}
      <p className="text-sm font-bold text-gray-500">
        {selected.length
          ? t(`${toBnDigits(selected.length)}টি এলাকা বাছাই করা হয়েছে`,
               `${selected.length} area${selected.length === 1 ? '' : 's'} chosen`)
          : t('অন্তত একটি এলাকা বাছুন', 'Choose at least one area')}
      </p>
    </div>
  );
}

// ─── the editor ──────────────────────────────────────────────────────────────

/**
 * @param {object}   props
 * @param {object}   props.value     the current `coverage` — { mode, radiusKm, thanas }
 * @param {string}   props.mode      'radius' | 'areas', from the category
 * @param {object[]} props.options   the radius ladder for this category
 * @param {Function} props.onChange  receives the WHOLE next coverage object
 */
const CoverageEditor = ({ value, mode, options = [], onChange }) => {
  const { t } = useLang();
  const selected = value?.thanas || [];

  if (mode === 'areas') {
    const toggle = (name) => {
      const has = selected.some((x) => norm(x) === norm(name));
      const next = has
        ? selected.filter((x) => norm(x) !== norm(name))
        : [...selected, name].slice(0, MAX_THANAS);
      onChange({ mode: 'areas', thanas: next });
    };

    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          {/* Says what the list DOES, because the consequence of leaving it
              empty is invisible and permanent. */}
          {t('যে এলাকাগুলোতে আপনি কাজ করেন সেগুলো বাছুন। শুধু এই এলাকার ভাড়াটিয়ারাই আপনাকে খুঁজে পাবেন।',
             'Pick the areas you work in. Only tenants in these areas will find you.')}
        </p>
        <ThanaPicker selected={selected} onToggle={toggle} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        {t('যত দূর পর্যন্ত আপনি যেতে রাজি।', 'How far you are willing to travel.')}
      </p>
      <RadiusLadder
        options={options}
        value={value?.radiusKm}
        onPick={(km) => onChange({ mode: 'radius', radiusKm: km })}
      />
    </div>
  );
};

export default CoverageEditor;
