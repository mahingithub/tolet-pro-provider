/**
 * categoryIcons.js — the category `icon` string → a real component.
 * ──────────────────────────────────────────────────────────────────────────
 * ⚠ DO NOT replace this with `import * as Icons from 'lucide-react'`.
 *
 * A namespace import defeats tree-shaking and pulls the ENTIRE icon set into
 * the bundle — it took this app from 256 kB to 1.47 MB (81 kB → 325 kB
 * gzipped) for the sake of fifteen glyphs. That is a catastrophic trade for
 * an audience on cheap Android phones and metered 2G/3G, which is exactly who
 * this app is for.
 *
 * So the map is explicit. Adding a category with a new icon means adding one
 * line here; forgetting to is harmless — `Store` is the fallback.
 *
 * Keep in step with the `icon` values in
 * tolet-pro-backend/config/serviceCategories.js.
 */

import {
  Flame,           // gas
  Droplets,        // water
  ShoppingBasket,  // grocery
  Users,           // domestic_helper
  Zap,             // electricity
  Wrench,          // plumber
  Wifi,            // internet
  Utensils,        // eatery
  Sparkles,        // cleaning   (planned)
  Hammer,          // repairs    (planned)
  Truck,           // movers     (planned)
  Shirt,           // laundry    (planned)
  GraduationCap,   // education  (planned)
  ShieldCheck,     // security   (planned)
  Bug,             // pest       (planned)
  Store,           // fallback
} from 'lucide-react';

const ICONS = {
  Flame,
  Droplets,
  ShoppingBasket,
  Users,
  Zap,
  Wrench,
  Wifi,
  Utensils,
  Sparkles,
  Hammer,
  Truck,
  Shirt,
  GraduationCap,
  ShieldCheck,
  Bug,
  Store,
};

/** Never returns undefined — an unmapped icon renders as a generic shop. */
export function iconFor(name) {
  return ICONS[name] || Store;
}

export default ICONS;
