/**
 * phone.js — accept the number the way a person actually says it.
 * ──────────────────────────────────────────────────────────────────────────
 * The API requires strict E.164 (`+8801XXXXXXXXX`) and rejects anything else
 * with a validation error. Nobody in Bangladesh writes their number that way:
 * they write `01711111111`, or `01711-111111`, or `০১৭১১১১১১১১` in Bengali
 * digits off a shop signboard.
 *
 * Making the provider learn E.164 to sign in is exactly the kind of small wall
 * that ends a registration. So the input keeps the familiar `01XXXXXXXXX`
 * placeholder and this normalises whatever arrives before it reaches the API.
 *
 * Deliberately conservative: anything it cannot confidently read is returned
 * untouched, so the server's own validation still gets the final say and this
 * can never silently turn one valid number into a different valid number.
 */

const BN_DIGITS = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };

/** `+8801711111111` from any of the ways a BD mobile is normally written. */
export function toE164(input) {
  const raw = String(input || '')
    .replace(/[০-৯]/g, (d) => BN_DIGITS[d])   // Bengali numerals off a signboard
    .replace(/[\s\-().]/g, '');               // spaces, dashes, brackets

  const digits = raw.replace(/^\+/, '');

  // 8801XXXXXXXXX (13 digits)
  if (/^8801[3-9]\d{8}$/.test(digits)) return `+${digits}`;
  // 01XXXXXXXXX (11 digits) — how it is nearly always written
  if (/^01[3-9]\d{8}$/.test(digits)) return `+88${digits}`;
  // 1XXXXXXXXX (10 digits) — the leading zero dropped
  if (/^1[3-9]\d{8}$/.test(digits)) return `+880${digits}`;

  // Not a shape we recognise. Hand it over untouched and let the server judge.
  return raw;
}

/** Is this a BD mobile we can send? Used only to enable/disable a button. */
export function looksLikeBdMobile(input) {
  return /^\+8801[3-9]\d{8}$/.test(toE164(input));
}
