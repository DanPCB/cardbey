/**
 * Runtime safety helpers for store-creation research.
 */

const MAX_DESCRIPTION_LEN = 320;

/**
 * Rewrite/summarize long or copyrighted-looking descriptions instead of copying verbatim.
 * @param {string} text
 */
export function summarizeDescription(text) {
  const cleaned = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  if (cleaned.length <= MAX_DESCRIPTION_LEN) return cleaned;
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  const summary = sentences.slice(0, 2).join(' ').trim();
  return summary.length > MAX_DESCRIPTION_LEN ? `${summary.slice(0, MAX_DESCRIPTION_LEN - 1)}…` : summary;
}

/**
 * @param {string} url
 */
export function isPermittedPublicUrl(url) {
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local')) return false;
    return true;
  } catch {
    return false;
  }
}
