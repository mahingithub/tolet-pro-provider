/**
 * geoService.js — place names, fetched rather than bundled.
 * ──────────────────────────────────────────────────────────────────────────
 * The thana list is 126 kB of generated data, and it is the SAME list the
 * tenant app's LocationBar offers. Both of those facts point the same way:
 * serve it.
 *
 *   • bundling it would put a sixth of a megabyte into an app a shopkeeper
 *     installs over 3G, for one screen he opens once.
 *   • a copy in this repo would drift from the tenant's copy, and the moment
 *     it does, a provider can select a coverage area that no tenant is able to
 *     search for — which is the exact failure this picker exists to fix.
 *
 * Same reasoning as the category registry in providerService.js. The server
 * holds it with a long ETag, so this is one cheap call per session.
 */

import { apiFetch } from './apiClient.js';

/**
 * Every thana a coverage area can name, metros first.
 * @returns {Promise<{ thanas: { en: string, bn: string, districtEn: string, districtBn: string }[], count: number }>}
 */
export const getThanas = () => apiFetch('/geo/thanas', { auth: false });

export default { getThanas };
