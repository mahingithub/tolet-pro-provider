import React from 'react';

/** A plain white surface. One radius, one shadow, used everywhere. */
const Card = ({ className = '', padded = true, children, ...rest }) => (
  <div
    className={[
      'bg-white border border-gray-200 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)]',
      padded ? 'p-4' : '',
      className,
    ].filter(Boolean).join(' ')}
    {...rest}
  >
    {children}
  </div>
);

export default Card;
