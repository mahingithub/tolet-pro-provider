import React from 'react';
import { Check } from 'lucide-react';

import { useLang, toBnDigits } from '../../context/LanguageContext.jsx';
import Field, { inputClass } from '../ui/Field.jsx';

/**
 * FieldRenderer — one generic renderer over the six field types.
 * ──────────────────────────────────────────────────────────────────────────
 * This is what makes "adding a category is adding an object" true on the
 * client as well as the server. Both screens that show a provider's answers —
 * step 6 of onboarding and the whole price editor — are this component in a
 * loop over `category.providerFields`. Neither knows what a গ্যাস সিলিন্ডার is.
 *
 * `price_rows` is the one that matters most. The row names are written FOR the
 * provider — চাল (মিনিকেট), মসুর ডাল, ১২ কেজি — and he types only numbers.
 * Never make a shopkeeper invent product names; that is the difference between
 * a form he finishes and a form he abandons.
 *
 * ─── BLANK IS NOT ZERO ───────────────────────────────────────────────────────
 * A blank price row means "I don't stock this" and must reach the API as
 * absent. Sending 0 renders on the tenant card as "free". So the inputs are
 * controlled with '' rather than 0, and `cleanPriceRows()` below drops empties
 * on the way out. The server enforces the same rule, but a UI that quietly
 * turns a blank into a 0 would never even get there.
 */

/** Strip blanks from a price_rows value so nothing goes out as 0. */
export function cleanPriceRows(rows = {}) {
  const out = {};
  for (const [k, v] of Object.entries(rows)) {
    if (v === '' || v === null || v === undefined) continue;
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 px-4 py-3 rounded-xl border text-base font-bold',
        'min-h-tap transition-all active:scale-[0.97]',
        active
          ? 'bg-crimson-50 border-[#ba0036] text-[#ba0036]'
          : 'bg-white border-gray-300 text-gray-700',
      ].join(' ')}
    >
      {active ? <Check size={16} className="shrink-0" /> : null}
      {children}
    </button>
  );
}

const FieldRenderer = ({ field, value, onChange, error }) => {
  const { t, bn } = useLang();

  const label = t(field.label.bn, field.label.en);
  const hint = field.hint ? t(field.hint.bn, field.hint.en) : null;
  const set = (v) => onChange(field.key, v);

  // ─── price_rows ────────────────────────────────────────────────────────────
  if (field.type === 'price_rows') {
    const rows = value || {};
    // The API names the offending rows, so the exact ones light up rather than
    // the whole table turning red.
    const badRows = new Set(error?.rows || []);

    return (
      <Field label={label} hint={hint} required={field.required} error={error?.message}>
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-white">
          {field.rows.map((row) => {
            const unit = row.unit ? t(row.unit.bn, row.unit.en) : '';
            return (
              <div key={row.key} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="flex-1 text-base font-semibold text-gray-800 leading-tight">
                  {t(row.bn, row.en)}
                  {unit ? <span className="text-sm text-gray-500 font-normal"> / {unit}</span> : null}
                </span>
                <div className="relative shrink-0">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base">৳</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    // Controlled with '' — never 0. A blank row is "I don't
                    // stock this", and 0 would read as "free" on the tenant card.
                    value={rows[row.key] ?? ''}
                    onChange={(e) => set({ ...rows, [row.key]: e.target.value })}
                    placeholder="—"
                    className={[
                      'w-28 min-h-[46px] pl-7 pr-3 py-2 rounded-lg border text-base text-right tabular-nums',
                      'outline-none transition focus:ring-2 focus:ring-[#ba0036]/15',
                      badRows.has(row.key)
                        ? 'border-red-400 bg-red-50'
                        : 'border-gray-300 focus:border-[#ba0036]',
                    ].join(' ')}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {t('যেগুলো আপনার কাছে নেই সেগুলো খালি রাখুন।', 'Leave blank whatever you don\'t stock.')}
        </p>
      </Field>
    );
  }

  // ─── multi ─────────────────────────────────────────────────────────────────
  if (field.type === 'multi') {
    const selected = Array.isArray(value) ? value : [];
    const toggle = (id) => set(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );
    return (
      <Field label={label} hint={hint} required={field.required} error={error?.message}>
        <div className="flex flex-wrap gap-2">
          {field.options.map((o) => (
            <Chip key={o.id} active={selected.includes(o.id)} onClick={() => toggle(o.id)}>
              {t(o.bn, o.en)}
            </Chip>
          ))}
        </div>
      </Field>
    );
  }

  // ─── choice ────────────────────────────────────────────────────────────────
  if (field.type === 'choice') {
    return (
      <Field label={label} hint={hint} required={field.required} error={error?.message}>
        <div className="flex flex-wrap gap-2">
          {field.options.map((o) => (
            <Chip key={o.id} active={value === o.id} onClick={() => set(o.id)}>
              {t(o.bn, o.en)}
            </Chip>
          ))}
        </div>
      </Field>
    );
  }

  // ─── bool ──────────────────────────────────────────────────────────────────
  if (field.type === 'bool') {
    return (
      <Field label={label} hint={hint} error={error?.message}>
        <div className="grid grid-cols-2 gap-2.5">
          <Chip active={value === true} onClick={() => set(true)}>{t('হ্যাঁ', 'Yes')}</Chip>
          <Chip active={value === false} onClick={() => set(false)}>{t('না', 'No')}</Chip>
        </div>
      </Field>
    );
  }

  // ─── money ─────────────────────────────────────────────────────────────────
  if (field.type === 'money') {
    return (
      <Field label={label} hint={hint} required={field.required} error={error?.message}>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">৳</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={value ?? ''}
            onChange={(e) => set(e.target.value)}
            className={`${inputClass} pl-10 tabular-nums`}
            placeholder="0"
          />
        </div>
      </Field>
    );
  }

  // ─── phone ─────────────────────────────────────────────────────────────────
  if (field.type === 'phone') {
    return (
      <Field label={label} hint={hint} required={field.required} error={error?.message}>
        <input
          type="tel"
          inputMode="numeric"
          value={value ?? ''}
          onChange={(e) => set(e.target.value)}
          className={inputClass}
          placeholder="01XXXXXXXXX"
        />
      </Field>
    );
  }

  // ─── text (and anything new we haven't taught this renderer yet) ───────────
  return (
    <Field label={label} hint={hint} required={field.required} error={error?.message}>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => set(e.target.value)}
        className={inputClass}
      />
    </Field>
  );
};

/**
 * Turn the API's `details` array into a lookup by field key, so each field can
 * find its own error without every field scanning the list.
 */
export function errorsByKey(details) {
  const map = {};
  for (const d of details || []) {
    if (d.key) map[d.key] = d;
  }
  return map;
}

/** Prepare a values object for the API: price_rows cleaned, blanks dropped. */
export function serialiseFields(category, values) {
  const out = {};
  for (const field of category.providerFields) {
    const v = values[field.key];
    if (v === undefined || v === null || v === '') continue;

    if (field.type === 'price_rows') {
      const cleaned = cleanPriceRows(v);
      if (Object.keys(cleaned).length) out[field.key] = cleaned;
      continue;
    }
    if (field.type === 'multi' && Array.isArray(v) && v.length === 0) continue;
    if (field.type === 'money') {
      const n = Number(v);
      if (Number.isFinite(n)) out[field.key] = n;
      continue;
    }
    out[field.key] = v;
  }
  return out;
}

export default FieldRenderer;
