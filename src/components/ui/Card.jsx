import React from 'react';

/**
 * A plain white surface. One radius, one shadow, used everywhere.
 *
 * ─── WHY THE SHADOW HAS TWO LAYERS ───────────────────────────────────────────
 * This used to be a hard `border-gray-200` AND a single soft blur. Both at once
 * is what made the app read as a form rather than a surface: the border draws a
 * hard line at the edge, the blur draws a second, softer one just outside it,
 * and every card ends up double-outlined.
 *
 * Real objects cast two shadows — a tight contact shadow where they meet the
 * surface, and a wide ambient one. Two layers at low opacity give that, so the
 * card can sit on the background instead of being drawn onto it, and the border
 * drops to gray-100 where it is a hairline rather than an outline.
 *
 * Nothing about the SIZE of anything changed here, deliberately. The last
 * blanket typography change across the rent UI was rejected for making the
 * screen cluttered, and this is the same audience.
 */
const Card = ({ className = '', padded = true, children, ...rest }) => (
  <div
    className={[
      'bg-white rounded-2xl border border-gray-100',
      'shadow-[0_1px_2px_rgba(16,24,40,0.04),0_6px_16px_-6px_rgba(16,24,40,0.08)]',
      padded ? 'p-4' : '',
      className,
    ].filter(Boolean).join(' ')}
    {...rest}
  >
    {children}
  </div>
);

export default Card;
