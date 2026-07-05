/** Matches common LLM preamble phrases to strip from generated text. */
const LLM_PREAMBLE_RE =
  /^(?:here(?:'s| is)(?: your)?[^.!?\n]{0,60}[.!?]\s*|sure[!,]?\s*|certainly[!,]?\s*|of course[!,]?\s*|absolutely[!,]?\s*|great[!,]?\s*)/i;

const SLOGAN_TIP_PREAMBLE_RE =
  /^(?:here(?:'s| are)(?: some)?(?: professional)?(?: slogans?)?(?: for (?:your )?[^:\n]{0,120})?:?\s*)/i;

const FIRST_NUMBERED_ITEM_RE =
  /(?:^|\n)\s*1[.)]\s*(.+?)(?=\n\s*2[.)]\s|\s+\d+[.)]\s|$)/s;

const TRAILING_LIST_ITEM_RE = /\s+\d+[.)]\s.*$/s;

const WRAPPING_QUOTES_RE = /^\s*["'""]|["'""]\s*$/g;

/**
 * Strip LLM tips and numbered lists — return one display-ready slogan.
 * @param {string|null|undefined} raw
 * @param {number|undefined} maxLength
 * @returns {string}
 */
export function sanitizeStoreSlogan(raw, maxLength) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  if (!s) return '';

  for (let i = 0; i < 3; i++) {
    const next = s.replace(SLOGAN_TIP_PREAMBLE_RE, '').replace(LLM_PREAMBLE_RE, '').trim();
    if (next === s) break;
    s = next;
  }

  const firstItem = s.match(FIRST_NUMBERED_ITEM_RE);
  if (firstItem?.[1]) {
    s = firstItem[1].trim();
  } else if (/^\d+[.)]\s/.test(s)) {
    s = s.replace(/^\d+[.)]\s*/, '');
  }

  s = s.replace(TRAILING_LIST_ITEM_RE, '').trim();
  s = s.replace(/\*\*/g, '').replace(/__/g, '').replace(WRAPPING_QUOTES_RE, '').trim();

  if (s.length > 0) s = s[0].toUpperCase() + s.slice(1);

  if (typeof maxLength === 'number' && maxLength > 0 && s.length > maxLength) {
    s = s.slice(0, maxLength).trimEnd();
  }

  return s;
}
