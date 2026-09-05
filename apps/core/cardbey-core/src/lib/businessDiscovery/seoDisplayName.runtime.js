/**
 * Leaf helper — strip SEO/page-title marketing from scraped display names.
 * Kept in businessDiscovery so *.runtime.js discovery modules do not import
 * storeCreation (avoids tsx remapping / deploy import-graph surprises).
 */

const SEO_SUFFIX_RE =
  /\b(same\s*day|same-day|delivery|florist|near\s*me|best|top\s*rated|open\s*now|serving|hours|buy\s*online|order\s*online|free\s*delivery)\b/i;

/**
 * @param {unknown} raw
 * @param {unknown} [hintName]
 * @returns {string}
 */
export function stripSeoBusinessDisplayName(raw, hintName = '') {
  const s = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';

  const hint = String(hintName ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (hint && hint.length >= 2) {
    const lower = s.toLowerCase();
    const hintLower = hint.toLowerCase();
    if (lower === hintLower) return hint;
    if (lower.startsWith(hintLower)) {
      const rest = s.slice(hint.length).trim();
      if (!rest || /^[-|–—:,]/.test(rest) || SEO_SUFFIX_RE.test(rest)) {
        return hint;
      }
    }
  }

  const parts = s.split(/\s*[-|–—]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const head = parts[0];
    const tail = parts.slice(1).join(' - ');
    if (SEO_SUFFIX_RE.test(tail) || /,\s*[\p{L}]/u.test(tail)) {
      return head;
    }
  }

  const colon = s.match(/^(.{3,60}?)\s*:\s+(.+)$/);
  if (colon && SEO_SUFFIX_RE.test(colon[2])) {
    return colon[1].trim();
  }

  return s;
}
