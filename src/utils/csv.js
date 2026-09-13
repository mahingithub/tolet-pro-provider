/**
 * csv.js — turn a table into a file the shopkeeper can hand to someone.
 * ──────────────────────────────────────────────────────────────────────────
 * The rows handed in here are ALREADY server-computed (report / statement
 * payloads). Nothing in this file does arithmetic; it only formats. That
 * separation is the point — a CSV that recomputed its own totals would be a
 * third place for the running balance to disagree with itself.
 *
 * ─── WHY THE BOM ─────────────────────────────────────────────────────────────
 * Excel on Windows opens a UTF-8 CSV as the system's legacy codepage unless the
 * file starts with a byte-order mark, and every Bengali name in the file turns
 * into mojibake. The single most likely destination for this file is somebody's
 * accountant opening it in Excel, so the BOM is not optional decoration.
 *
 * ─── WHY NUMBERS STAY LATIN HERE ─────────────────────────────────────────────
 * Bengali digits everywhere else in this app, and deliberately NOT here: a
 * spreadsheet cannot add up ৳১২৫০. The screen is for reading, the file is for
 * calculating, and they have different rules.
 */

/** RFC 4180: quote anything containing a comma, quote or newline. */
function cell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** `rows` is an array of arrays — the first one being the header. */
export function toCsv(rows) {
  // CRLF, because that is what Excel expects and what every other reader
  // tolerates.
  return `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}`;
}

/**
 * Hand the file to the browser.
 *
 * A data: URL would be simpler and breaks on large files in Android WebViews,
 * which is a large share of this audience — a Blob URL does not, and is revoked
 * on the next tick so the page does not leak one per export.
 */
export function downloadCsv(filename, rows) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 0);
}
