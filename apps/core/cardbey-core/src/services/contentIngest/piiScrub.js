/**
 * PII scrubber for content ingest samples. Pure utility; no I/O.
 * Used only when ENABLE_CONTENT_INGEST_LOGS=true. Do not log raw user text in production.
 */

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
const URL_RE = /https?:\/\/[^\s]+/gi;
// Simple heuristic: number(s) optionally followed by words, then street-like tokens (St, Street, Rd, Ave, etc.)
const STREET_RE = /\b\d+[\s\d]*(?:\s+\w+)*\s+(?:St\.?|Street|Rd\.?|Road|Ave\.?|Avenue|Blvd\.?|Boulevard|Ln\.?|Lane|Dr\.?|Drive|Ct\.?|Court|Pl\.?|Place|Way|Pkwy\.?|Parkway)\b[^.]*\.?/gi;

const REPLACEMENTS = {
  email: '[email]',
  phone: '[phone]',
  url: '[url]',
  address: '[address]',
};

/**
 * Remove PII from a string: emails, phone-like sequences, URLs, simple street addresses.
 * Trims and truncates to maxLen (default 800).
 * @param {string} input - Raw text (may be null/undefined)
 * @param {{ maxLen?: number }} [opts] - maxLen default 800
 * @returns {string}
 */
function scrubText(input, opts = {}) {
  if (input == null || typeof input !== 'string') return '';
  const maxLen = opts.maxLen ?? 800;
  let s = input.trim();
  if (!s) return '';

  s = s.replace(EMAIL_RE, REPLACEMENTS.email);
  s = s.replace(PHONE_RE, REPLACEMENTS.phone);
  s = s.replace(URL_RE, REPLACEMENTS.url);
  s = s.replace(STREET_RE, REPLACEMENTS.address);
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > maxLen) s = s.slice(0, maxLen).trim();
  return s;
}

export { scrubText };
