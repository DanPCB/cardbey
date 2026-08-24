/**
 * Canonical business tagline / slogan normalizer.
 * Safety net after generation — public surfaces must receive display text only.
 */

/** Matches common LLM preamble phrases to strip from generated text. */
const LLM_PREAMBLE_RE =
  /^(?:here(?:'s| is)(?: your)?[^.!?\n]{0,60}[.!?]\s*|sure[!,]?\s*|certainly[!,]?\s*|of course[!,]?\s*|absolutely[!,]?\s*|great[!,]?\s*)/i;

/**
 * Generation wrappers seen in production (Anison Capital, BB Flowers, tip lists).
 * Applied repeatedly until stable.
 */
const SLOGAN_WRAPPER_RES = [
  /^(?:here(?:'s| are)(?: some)?(?: professional)?(?: slogans?|taglines?)?(?: for (?:your )?[^:\n]{0,120})?:?\s*)/i,
  /^(?:a\s+)?(?:professional\s+)?(?:catchy\s+)?(?:slogan|tagline)\s+for\s+[^:\n]{1,160}:?\s*/i,
  /^(?:professional|catchy|suggested|recommended|sample|example)\s+(?:slogan|tagline)\s*:?\s*/i,
  /^(?:slogan|tagline)\s*:?\s*/i,
  /^(?:top\s+pick|editor'?s?\s+pick|our\s+pick|best\s+pick)\s*:?\s*/i,
  /^(?:suggestion|recommended|recommendation)\s*:?\s*/i,
  /^(?:here(?:'s| is)(?: a| your)?(?: professional)?(?: slogan|tagline)?)\s*:?\s*/i,
];

const FIRST_NUMBERED_ITEM_RE =
  /(?:^|\n)\s*1[.)]\s*(.+?)(?=\n\s*2[.)]\s|\s+\d+[.)]\s|$)/s;

const TRAILING_LIST_ITEM_RE = /\s+\d+[.)]\s.*$/s;

const WRAPPING_QUOTES_RE = /^[\s"'“”‘’`]+|[\s"'“”‘’`]+$/g;

const META_LANGUAGE_RE =
  /\b(?:professional\s+slogan|suggested\s+slogan|recommended\s+slogan|here(?:'s| is)\s+(?:a|your|some)\s+slogan|top\s+pick)\b/i;

/**
 * @param {string} s
 * @returns {string}
 */
function stripWrappersOnce(s) {
  let next = s;
  for (const re of SLOGAN_WRAPPER_RES) {
    next = next.replace(re, '');
  }
  return next.replace(LLM_PREAMBLE_RE, '').trim();
}

/**
 * Strip LLM tips, labels, markdown, and quotes — return one display-ready slogan.
 * @param {string|null|undefined} raw
 * @param {number|undefined} maxLength
 * @returns {string}
 */
export function sanitizeStoreSlogan(raw, maxLength) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  if (!s) return '';

  // When the model puts a wrapper on line 1 and the slogan on line 2, keep the slogan line.
  if (s.includes('\n')) {
    const lines = s
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const quotedLine = lines.find((l) => /^["'“”]/.test(l));
    if (quotedLine) {
      s = quotedLine;
    } else if (lines.length > 1 && /(?:slogan|tagline|top\s+pick)\b/i.test(lines[0])) {
      s = lines.slice(1).join(' ');
    } else if (lines[0]) {
      s = lines[0];
    }
  }

  for (let i = 0; i < 5; i++) {
    const next = stripWrappersOnce(s);
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
  // Strip markdown emphasis wrappers (*bold*, _italic_, backticks).
  s = s.replace(/\*\*/g, '').replace(/__/g, '').replace(/`+/g, '').replace(/\*/g, '').trim();
  s = s.replace(WRAPPING_QUOTES_RE, '').trim();
  // Second pass after quote/markdown removal (wrappers sometimes wrap the quoted slogan).
  for (let i = 0; i < 3; i++) {
    const next = stripWrappersOnce(s).replace(WRAPPING_QUOTES_RE, '').trim();
    if (next === s) break;
    s = next;
  }

  if (s.length > 0) s = s[0].toUpperCase() + s.slice(1);

  if (typeof maxLength === 'number' && maxLength > 0 && s.length > maxLength) {
    s = s.slice(0, maxLength).trimEnd();
  }

  return s;
}

/**
 * True when the string still looks like model meta / prompt leakage after sanitize attempts.
 * @param {string|null|undefined} raw
 * @returns {boolean}
 */
export function looksLikeSloganMeta(raw) {
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  if (!s) return false;
  if (META_LANGUAGE_RE.test(s)) return true;
  if (/^(?:slogan|tagline)\s*:/i.test(s)) return true;
  if (/^top\s+pick\s*:/i.test(s)) return true;
  if (/^a\s+professional\s+slogan\b/i.test(s)) return true;
  if (/^here(?:'s| is)\b/i.test(s)) return true;
  if (/[*`]{1,2}/.test(s) && /["']/.test(s)) return true;
  return false;
}

/**
 * Validate a customer-facing slogan after normalization.
 * @param {string|null|undefined} raw
 * @returns {boolean}
 */
export function isCustomerFacingSlogan(raw) {
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  if (!s) return false;
  if (s.length < 3 || s.length > 160) return false;
  if (looksLikeSloganMeta(s)) return false;
  if (/^[{[]/.test(s)) return false;
  if (/[*`]/.test(s) && /\b(slogan|tagline|pick)\b/i.test(s)) return false;
  if ((s.match(/"/g) || []).length >= 2 && s.startsWith('"')) return false;
  return true;
}

/**
 * Normalize then validate. Returns cleaned slogan or '' if unusable.
 * @param {string|null|undefined} raw
 * @param {number|undefined} maxLength
 * @returns {{ slogan: string, repaired: boolean, valid: boolean }}
 */
export function normalizeAndValidateSlogan(raw, maxLength) {
  const before = typeof raw === 'string' ? raw.trim() : '';
  const slogan = sanitizeStoreSlogan(raw, maxLength);
  const valid = isCustomerFacingSlogan(slogan) && !looksLikeSloganMeta(slogan);
  return {
    slogan: valid ? slogan : '',
    repaired: Boolean(before && slogan && before !== slogan),
    valid,
  };
}
