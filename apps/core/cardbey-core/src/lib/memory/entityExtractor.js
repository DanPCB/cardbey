/**
 * Rule-based entity reference extraction from user messages (no DB, no LLM).
 *
 * Does NOT treat arbitrary capitalized phrases as product names — that caused store-setup
 * pill submits ("My Beauty · Beauty · Melbourne") to hit product catalog search before
 * intent classification. Product refs require explicit product/menu/item phrasing or quotes.
 */

export const ENTITY_TYPES = ['store', 'product', 'campaign', 'image', 'service'];

const PRONOUN_RE =
  /\b(it|that|this|this one|the same|retry it|do it again|try again|same one|that one|this store|that store)\b/i;

const STORE_PATTERNS = [
  /\bmy\s+(?:store|shop|web\s*store|website|business|bakery|cafe|restaurant)\b/i,
  /\bthe\s+store\b/i,
  /\bour\s+store\b/i,
  /\bthis\s+store\b/i,
  /\bthat\s+store\b/i,
];

const PRODUCT_PATTERNS = [
  /\bthe\s+product\b/i,
  /\bthat\s+item\b/i,
  /\bthis\s+item\b/i,
  /\bthe\s+menu\s+item\b/i,
  /\bmy\s+product\b/i,
];

const CAMPAIGN_PATTERNS = [
  /\bthe\s+campaign\b/i,
  /\bthat\s+campaign\b/i,
  /\bmy\s+campaign\b/i,
  /\bthis\s+campaign\b/i,
];

const IMAGE_PATTERNS = [
  /\bthe\s+hero\s+image\b/i,
  /\bhero\s+image\b/i,
  /\bthe\s+logo\b/i,
  /\bmy\s+logo\b/i,
  /\bthe\s+banner\b/i,
];

const SERVICE_PATTERNS = [/\bthe\s+service\b/i, /\bbook\s+(?:a|an)\s+/i];

/** Explicit product/menu CRUD or lookup phrasing — required before quoted names → product. */
const PRODUCT_INTENT_RE =
  /\b(product|products|menu\s+item|menu\s+items|item|items|sku|catalog|price|pricing|stock|inventory)\b/i;

/** @type {RegExp} */
const QUOTED_RE = /[""]([^""]{2,120})[""]|'([^']{2,120})'/g;

/**
 * @typedef {{
 *   type: 'store' | 'product' | 'campaign' | 'image' | 'service';
 *   ref: string;
 *   pronoun: boolean;
 *   position: number;
 * }} EntityRef
 */

/**
 * @param {string} text
 * @param {number} index
 * @param {string} ref
 * @param {'store' | 'product' | 'campaign' | 'image' | 'service'} type
 * @returns {EntityRef}
 */
function makeRef(text, index, ref, type) {
  const trimmed = String(ref ?? '').trim();
  const pronoun = PRONOUN_RE.test(trimmed) || /^(it|that|this)$/i.test(trimmed);
  return {
    type,
    ref: trimmed || text.slice(index, index + 40).trim(),
    pronoun,
    position: index,
  };
}

/**
 * @param {EntityRef[]} out
 * @param {EntityRef} candidate
 */
function pushUnique(out, candidate) {
  const key = `${candidate.type}:${candidate.ref.toLowerCase()}:${candidate.position}`;
  if (out.some((r) => `${r.type}:${r.ref.toLowerCase()}:${r.position}` === key)) return;
  out.push(candidate);
}

/**
 * Parse a raw user message into typed entity references.
 * @param {string} message
 * @returns {EntityRef[]}
 */
export function extractEntities(message) {
  const text = String(message ?? '').trim();
  if (!text) return [];

  /** @type {EntityRef[]} */
  const out = [];

  for (const re of STORE_PATTERNS) {
    const m = re.exec(text);
    if (m) pushUnique(out, makeRef(text, m.index, m[0], 'store'));
  }

  for (const re of PRODUCT_PATTERNS) {
    const m = re.exec(text);
    if (m) pushUnique(out, makeRef(text, m.index, m[0], 'product'));
  }

  for (const re of CAMPAIGN_PATTERNS) {
    const m = re.exec(text);
    if (m) pushUnique(out, makeRef(text, m.index, m[0], 'campaign'));
  }

  for (const re of IMAGE_PATTERNS) {
    const m = re.exec(text);
    if (m) pushUnique(out, makeRef(text, m.index, m[0], 'image'));
  }

  for (const re of SERVICE_PATTERNS) {
    const m = re.exec(text);
    if (m) pushUnique(out, makeRef(text, m.index, m[0], 'service'));
  }

  const productIntent = PRODUCT_INTENT_RE.test(text);

  let qm;
  QUOTED_RE.lastIndex = 0;
  while ((qm = QUOTED_RE.exec(text)) !== null) {
    const quoted = (qm[1] ?? qm[2] ?? '').trim();
    if (quoted.length >= 2) {
      pushUnique(out, makeRef(text, qm.index, quoted, productIntent ? 'product' : 'store'));
    }
  }

  const pronounOnly = text.match(/\b(it|that|this one|this)\b/i);
  if (pronounOnly) {
    pushUnique(out, makeRef(text, text.indexOf(pronounOnly[0]), pronounOnly[0], 'store'));
  }

  out.sort((a, b) => a.position - b.position);
  return out;
}
