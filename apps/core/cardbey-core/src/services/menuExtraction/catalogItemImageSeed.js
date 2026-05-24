/**
 * Seed catalog item images after menu upload (seed library → Pexels).
 * Same intent as storeBuildQaAutoFix.fixMissingProductImages, plus generateImageForDraftItem fallback.
 */

import {
  isAbsoluteHttpUrl,
  resolveUsableDraftItemImageUrl,
} from '../draftStore/draftStoreService.js';
import { getSeedImageForCategory, resolveMenuItemSeedKeys } from '../../lib/seedLibrary/getSeedImageForCategory.js';

/**
 * @param {{ categoryKey?: string | null; vertical?: string | null; businessName?: string | null }} keys
 * @returns {Promise<string | null>}
 */
async function lookupSeedUrlWithFallbacks(keys) {
  const vertical = keys.vertical || 'food';
  const categoryCandidates = [
    keys.categoryKey,
    'coffee',
    'cafe',
    'food',
    'bakery',
  ].filter((k, i, arr) => k && arr.indexOf(k) === i);

  const orientationAttempts = [null, 'landscape', 'square'];

  for (const categoryKey of categoryCandidates) {
    for (const orientation of orientationAttempts) {
      const url = await getSeedImageForCategory({
        categoryKey,
        vertical,
        orientation,
        businessName: keys.businessName ?? null,
      });
      if (url && isAbsoluteHttpUrl(url)) return url;
    }
  }
  return null;
}

/**
 * @param {object} item
 * @param {{ businessName?: string | null; storeType?: string | null; usedUrls?: Set<string> }} ctx
 * @returns {Promise<string | null>}
 */
export async function resolveCatalogItemImageUrl(item, ctx = {}) {
  const existing = resolveUsableDraftItemImageUrl(item);
  if (existing) return existing;

  const name = typeof item?.name === 'string' ? item.name.trim() : '';
  const category = typeof item?.category === 'string' ? item.category.trim() : '';
  const description = typeof item?.description === 'string' ? item.description.trim() : '';

  const keys = resolveMenuItemSeedKeys(name, category, ctx.businessName ?? null);
  const seedUrl = await lookupSeedUrlWithFallbacks({
    categoryKey: keys.categoryKey,
    vertical: keys.vertical,
    businessName: ctx.businessName ?? null,
  });
  if (seedUrl) return seedUrl;

  try {
    const menuMod = await import('../menuVisualAgent/menuVisualAgent.ts');
    const generateImageForDraftItem =
      menuMod.generateImageForDraftItem ?? menuMod.default?.generateImageForDraftItem;
    if (typeof generateImageForDraftItem !== 'function') return null;

    const storeTypeKey = String(ctx.storeType || 'cafe')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_');
    const styleName =
      storeTypeKey.includes('cafe') ||
      storeTypeKey.includes('coffee') ||
      storeTypeKey.includes('food') ||
      storeTypeKey.includes('restaurant') ||
      storeTypeKey.includes('bakery')
        ? 'warm'
        : 'modern';

    const result = await generateImageForDraftItem(name, description || null, styleName, {
      categoryName: category || 'Coffee',
      businessType: ctx.storeType ?? 'cafe',
      usedUrls: ctx.usedUrls,
    });
    const url = result?.url && String(result.url).trim() ? String(result.url).trim() : null;
    if (url && isAbsoluteHttpUrl(url)) {
      ctx.usedUrls?.add(url);
      return url;
    }
  } catch (e) {
    console.warn('[catalog-image-seed] Pexels/generate failed', { name, message: e?.message || e });
  }

  return null;
}

/**
 * Attach imageUrl to draft catalog rows when missing.
 *
 * @param {object[]} items
 * @param {{ businessName?: string | null; storeType?: string | null }} [ctx]
 * @returns {Promise<object[]>}
 */
export async function seedMenuCatalogItemsImages(items, ctx = {}) {
  if (!Array.isArray(items) || !items.length) return items;
  const usedUrls = new Set();
  let seeded = 0;

  const out = await Promise.all(
    items.map(async (item) => {
      if (!item || typeof item !== 'object') return item;
      const url = await resolveCatalogItemImageUrl(item, { ...ctx, usedUrls });
      if (url) {
        seeded += 1;
        return {
          ...item,
          imageUrl: url,
          imageSource: item.imageSource || 'menu_upload_seed',
        };
      }
      return item;
    }),
  );

  console.log('[catalog-image-seed] complete', {
    itemCount: items.length,
    seeded,
    storeType: ctx.storeType ?? null,
  });

  return out;
}
