/**
 * Deduplicate and canonicalise service catalog items before image resolution.
 */

import {
  buildCanonicalServiceKey,
  canonicalizeServiceTitle,
  normalizeServiceKey,
} from './serviceImageIntentResolver.js';

/**
 * @param {object} item
 * @param {string} [categoryName]
 */
function scoreItemRichness(item, categoryName = '') {
  let score = 0;
  if (item?.description && String(item.description).trim().length > 12) score += 3;
  if (typeof item?.price === 'number' && item.price > 0) score += 2;
  if (item?.fromPrice) score += 1;
  if (item?.durationMinutes) score += 1;
  if (!/-\s*chef'?s?$/i.test(String(item?.name ?? ''))) score += 2;
  if (categoryName) score += 1;
  return score;
}

/**
 * @param {object[]} items
 * @param {object[]} [categories]
 * @returns {{ items: object[], removedCount: number, mergedKeys: string[] }}
 */
export function dedupeServiceCatalogItems(items, categories = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return { items: [], removedCount: 0, mergedKeys: [] };
  }

  const categoryNameById = new Map(
    (Array.isArray(categories) ? categories : []).map((c) => [c.id, c.name ?? c.label ?? '']),
  );

  /** @type {Map<string, { item: object, score: number }>} */
  const bestByKey = new Map();
  const mergedKeys = [];

  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const categoryName = categoryNameById.get(raw.categoryId) ?? raw.category ?? '';
    const canonicalTitle = canonicalizeServiceTitle(raw.name ?? raw.title ?? '');
    if (!canonicalTitle) continue;
    const key = buildCanonicalServiceKey(canonicalTitle, categoryName);
    const normalized = {
      ...raw,
      name: canonicalTitle,
      title: canonicalTitle,
      canonicalServiceKey: key,
      canonicalServiceTitle: canonicalTitle,
    };
    const score = scoreItemRichness(normalized, categoryName);
    const existing = bestByKey.get(key);
    if (!existing) {
      bestByKey.set(key, { item: normalized, score });
      continue;
    }
    mergedKeys.push(`${normalizeServiceKey(raw.name ?? '')}→${canonicalTitle}`);
    if (score > existing.score) {
      bestByKey.set(key, {
        item: {
          ...existing.item,
          ...normalized,
          description: normalized.description || existing.item.description,
          price: normalized.price ?? existing.item.price,
          fromPrice: normalized.fromPrice ?? existing.item.fromPrice,
        },
        score,
      });
    } else {
      bestByKey.set(key, {
        item: {
          ...normalized,
          ...existing.item,
          name: canonicalTitle,
          title: canonicalTitle,
          description: existing.item.description || normalized.description,
          price: existing.item.price ?? normalized.price,
        },
        score: existing.score,
      });
    }
  }

  const deduped = [...bestByKey.values()].map((v) => v.item);
  return {
    items: deduped,
    removedCount: items.length - deduped.length,
    mergedKeys,
  };
}
