import React from 'react';

/**
 * Status pill. `tone` is intent, not colour, so a screen never has to decide
 * what shade "waiting for review" is.
 */
const TONES = {
  neutral: 'bg-gray-100 text-gray-700 border-gray-200',
  info:    'bg-blue-50 text-blue-700 border-blue-100',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  warn:    'bg-amber-50 text-amber-700 border-amber-100',
  danger:  'bg-red-50 text-red-700 border-red-100',
  brand:   'bg-crimson-50 text-[#ba0036] border-crimson-100',
};

const Badge = ({ tone = 'neutral', icon: Icon, className = '', children }) => (
  <span
    className={[
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold',
      TONES[tone] || TONES.neutral,
      className,
    ].filter(Boolean).join(' ')}
  >
    {Icon ? <Icon size={13} className="shrink-0" /> : null}
    {children}
  </span>
);

export default Badge;
