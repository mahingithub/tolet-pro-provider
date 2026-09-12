import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * The provider app's one button.
 * ──────────────────────────────────────────────────────────────────────────
 * Deliberately BIGGER than the admin console's equivalent. The default size
 * clears the 52px tap floor from tailwind.config.js, because the two controls
 * this app is built around — গ্রহণ and বাতিল on an incoming order — are tapped
 * quickly, one-handed, often while the provider is doing something else. A
 * miss-tap there costs him a real order or forces him to cancel one he meant
 * to take.
 *
 * Variants map to intent, not to colour:
 *   primary   the one affirmative action on a screen (গ্রহণ করুন, সাবমিট)
 *   secondary everything neutral
 *   danger    decline / cancel — outlined, never a loud red block, because
 *             declining honestly is legitimate behaviour and the UI should not
 *             make it feel like a punishment
 *   ghost     tertiary, sits inside another surface
 */

const VARIANTS = {
  primary:   'bg-[#ba0036] text-white border border-transparent hover:bg-[#90002a] shadow-sm active:scale-[0.98]',
  secondary: 'bg-white text-gray-800 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98]',
  success:   'bg-emerald-600 text-white border border-transparent hover:bg-emerald-700 shadow-sm active:scale-[0.98]',
  danger:    'bg-white text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300 active:scale-[0.98]',
  ghost:     'bg-transparent text-gray-600 border border-transparent hover:bg-gray-100 hover:text-gray-900',
};

const SIZES = {
  sm: 'px-4 py-2.5 text-sm gap-2 rounded-xl min-h-[44px]',
  md: 'px-5 py-3.5 text-base gap-2 rounded-2xl min-h-tap',
  lg: 'px-6 py-4 text-lg gap-2.5 rounded-2xl min-h-[60px]',
};

const ICON_SIZE = { sm: 16, md: 19, lg: 22 };

const Button = ({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconClassName = '',
  loading = false,
  fullWidth = false,
  className = '',
  children,
  type = 'button',
  disabled,
  ...rest
}) => {
  const iconSize = ICON_SIZE[size] || ICON_SIZE.md;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center font-bold tracking-tight transition-all',
        // No `pointer-events-none` on disabled: a locked control often explains
        // itself through the native title tooltip, and killing pointer events
        // would silently take that explanation away.
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
        VARIANTS[variant] || VARIANTS.secondary,
        SIZES[size] || SIZES.md,
        fullWidth ? 'w-full' : '',
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {loading ? (
        <Loader2 size={iconSize} className="animate-spin shrink-0" />
      ) : Icon ? (
        <Icon size={iconSize} className={`shrink-0 ${iconClassName}`} />
      ) : null}
      {children}
    </button>
  );
};

export default Button;
