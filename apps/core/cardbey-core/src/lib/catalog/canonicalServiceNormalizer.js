/**
 * Canonicalise service titles — strip scraped suffixes and merge duplicates.
 */

import { dedupeServiceCatalogItems } from '../../services/media/serviceCatalogDedupe.js';

const SOURCE_SUFFIX_PATTERNS = [
  /\s*-?\s*chef'?s?\s*$/i,
  /\s+-\s*special\s*$/i,
  /\s+-\s*house\s*$/i,
  /\s+-\s*style\s+\w+\s*$/i,
  /\s+-\s*option\s+\d+\s*$/i,
  /\s+-\s*from\s+\w+\s*$/i,
  /\s+-\s*via\s+\w+\s*$/i,
  /\s*-\s*[A-Z][a-z]+'?s?\s*$/,
];

/**
 * @param {string} name
 * @returns {{ canonicalName: string, removedSuffixes: string[], confidence: number }}
 */
export function canonicalizeServiceName(name) {
  const original = String(name ?? '').trim();
  if (!original) {
    return { canonicalName: '', removedSuffixes: [], confidence: 0 };
  }

  let canonicalName = original;
  const removedSuffixes = [];

  for (const pattern of SOURCE_SUFFIX_PATTERNS) {
    const match = canonicalName.match(pattern);
    if (match) {
      removedSuffixes.push(match[0].trim());
      canonicalName = canonicalName.replace(pattern, '').trim();
    }
  }

  canonicalName = canonicalName.replace(/\s{2,}/g, ' ').replace(/\s+-\s*$/, '').trim();

  const confidence = removedSuffixes.length > 0 ? 0.85 : canonicalName === original ? 1 : 0.75;
  return { canonicalName: canonicalName || original, removedSuffixes, confidence };
}

/**
 * @param {object} item
 * @param {string} [defaultCategory]
 * @returns {import('../commerce/commerceProfileTypes.js').CanonicalService}
 */
export function toCanonicalService(item, defaultCategory = 'general') {
  const originalName = String(item?.name ?? item?.title ?? '').trim();
  const { canonicalName, removedSuffixes, confidence } = canonicalizeServiceName(originalName);
  return {
    originalName,
    canonicalName,
    serviceCategory: String(item?.category ?? item?.categoryKey ?? defaultCategory),
    aliases: originalName !== canonicalName ? [originalName] : [],
    removedSuffixes,
    confidence,
  };
}

/**
 * @param {object[]} items
 * @param {{ logContext?: string }} [opts]
 * @returns {{ items: object[], canonical: import('../commerce/commerceProfileTypes.js').CanonicalService[], mergedCount: number }}
 */
export function normalizeCanonicalServices(items, opts = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return { items: [], canonical: [], mergedCount: 0 };
  }

  const canonical = [];
  const normalized = items.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const cs = toCanonicalService(item);
    canonical.push(cs);
    return {
      ...item,
      name: cs.canonicalName,
      canonicalServiceTitle: cs.canonicalName,
      ...(cs.removedSuffixes.length > 0 ? { titleNormalization: cs } : {}),
    };
  });

  const deduped = dedupeServiceCatalogItems(normalized);
  const mergedCount = deduped.removedCount ?? Math.max(0, normalized.length - (deduped.items?.length ?? normalized.length));

  return {
    items: deduped.items ?? normalized,
    canonical,
    mergedCount,
  };
}

/**
 * @param {string} name
 */
export function isMalformedServiceTitle(name) {
  const { removedSuffixes, canonicalName } = canonicalizeServiceName(name);
  return removedSuffixes.length > 0 || /\s+-\s*(chef|house|special)\b/i.test(String(name ?? ''));
}
