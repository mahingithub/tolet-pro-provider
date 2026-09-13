import React from 'react';

/**
 * One labelled input.
 * ──────────────────────────────────────────────────────────────────────────
 * The label sits ABOVE the input and never floats or shrinks into the border.
 * A floating label disappears the moment someone starts typing, and on a form
 * where half the questions are unfamiliar ("ভিজিট চার্জ") losing the question
 * mid-answer is exactly the failure that gets a registration abandoned.
 */
const Field = ({
  label, hint, error, required = false, className = '', children, htmlFor,
}) => (
  <label htmlFor={htmlFor} className={`block ${className}`}>
    <span className="block text-sm font-bold text-gray-800 mb-1.5">
      {label}
      {required ? <span className="text-[#ba0036] ml-1">*</span> : null}
    </span>
    {hint ? <span className="block text-xs text-gray-500 mb-2">{hint}</span> : null}
    {children}
    {error ? <span className="block text-xs font-semibold text-red-600 mt-1.5">{error}</span> : null}
  </label>
);

export const inputClass = [
  'w-full min-h-tap px-4 py-3 rounded-xl bg-white',
  // gray-200 rather than 300: at the old weight every field read as a boxed
  // cell on a form, and a screen of them looked like paperwork. The focus ring
  // does the work of showing which one is live.
  'border border-gray-200 hover:border-gray-300',
  'focus:border-[#ba0036] focus:ring-4 focus:ring-[#ba0036]/10',
  'text-base text-gray-900 placeholder:text-gray-400 outline-none transition',
].join(' ');

export default Field;
