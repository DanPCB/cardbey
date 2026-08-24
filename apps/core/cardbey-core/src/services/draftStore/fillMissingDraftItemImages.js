/**
 * Fill missing draft catalog imageUrl values via Pexels (OpenAI fallback in menuVisualAgent).
 * Shared by QA auto-fix, structured store build, and background catalog image fetch.
 */

import { effectiveVertical, applyItemGuards, isDraftGuardsEnabled, isBlockedCandidateForFood } from './draftGuards.js';
import { resolveUsableDraftItemImageUrl } from './draftStoreService.js';
import { runBusinessImageEnricherTool } from './businessImageEnricher.ts';

const BUSINESS_TYPE_TO_STYLE = {
  cafe: 'warm',
  'coffee-shop': 'warm',
  coffee_shop: 'warm',
  restaurant: 'warm',
  bakery: 'warm',
  bar: 'warm',
  fashion: 'modern',
  florist: 'vibrant',
  salon: 'modern',
  spa: 'modern',
  design: 'minimal',
  studio: 'minimal',
};

/**
 * @param {object} input
 * @param {object[]} input.items - mutable item rows
 * @param {object[]} [input.categories]
 * @param {string|null} [input.storeName]
 * @param {string|null} [input.storeType]
 * @param {string|null} [input.location]
 * @param {object|null} [input.generationProfile]
 * @param {number} [input.maxItems]
 * @returns {Promise<{ patched: number }>}
 */
export async function fillMissingDraftItemImages({
  items,
  categories = [],
  storeName = null,
  storeType = null,
  location = null,
  generationProfile = null,
  maxItems = 30,
}) {
  if (!Array.isArray(items) || items.length === 0) {
    return { patched: 0 };
  }

  try {
    const { dedupeServiceCatalogItems } = await import('../media/serviceImageResolver.js');
    const deduped = dedupeServiceCatalogItems(items, categories);
    if (deduped.removedCount > 0) {
      items.splice(0, items.length, ...deduped.items);
    }
  } catch {
    /* non-blocking */
  }

  const idxList = [];
  for (let i = 0; i < items.length && idxList.length < maxItems; i++) {
    if (!resolveUsableDraftItemImageUrl(items[i])) idxList.push(i);
  }
  if (!idxList.length) return { patched: 0 };

  let menuMod = null;
  try {
    menuMod = await import('../menuVisualAgent/menuVisualAgent.ts');
  } catch {
    return { patched: 0 };
  }
  const generateImageForDraftItem =
    menuMod.generateImageForDraftItem ?? menuMod.default?.generateImageForDraftItem;
  if (typeof generateImageForDraftItem !== 'function') {
    return { patched: 0 };
  }

  const locationStr = location != null && String(location).trim() ? String(location).trim() : null;
  const imageFillProfile = generationProfile
    ? {
        verticalSlug: generationProfile.verticalSlug || '',
        verticalGroup:
          generationProfile.verticalGroup || (generationProfile.verticalSlug || '').split('.')[0] || undefined,
        keywords: generationProfile.keywords,
        forbiddenKeywords: generationProfile.forbiddenKeywords,
        audience: generationProfile.audience,
        categoryHints: generationProfile.categoryHints,
      }
    : null;

  const nameTokens = idxList
    .map((idx) => String(items[idx]?.name || '').trim())
    .filter(Boolean)
    .slice(0, 20);
  const mergedProfile = imageFillProfile
    ? {
        ...imageFillProfile,
        keywords: [...(imageFillProfile.keywords || []), ...nameTokens].slice(0, 24),
      }
    : nameTokens.length
      ? { verticalSlug: '', keywords: nameTokens, forbiddenKeywords: [] }
      : null;

  let effectiveImageFillProfile = mergedProfile;
  try {
    const toolOut = await runBusinessImageEnricherTool({
      storeName,
      businessType: storeType,
      location: locationStr ?? undefined,
      ...(mergedProfile ? { profile: mergedProfile } : {}),
    });
    effectiveImageFillProfile = toolOut.effectiveImageFillProfile ?? toolOut.profile ?? mergedProfile;
  } catch {
    // non-blocking — proceed with merged profile
  }

  const guardsEnabled = isDraftGuardsEnabled();
  const effectiveVerticalType = guardsEnabled ? effectiveVertical(storeType, storeType) : null;

  let deriveItemCategoryHint = (itemName, verticalSlug, storeTypeHint) =>
    [itemName, verticalSlug, storeTypeHint].filter(Boolean).join(' ').trim();
  try {
    const mod = await import('../react/buildStoreReactTools.ts');
    if (typeof mod.deriveItemCategoryHint === 'function') deriveItemCategoryHint = mod.deriveItemCategoryHint;
  } catch {
    // keep fallback
  }

  const verticalForItem =
    effectiveImageFillProfile?.verticalSlug ?? imageFillProfile?.verticalSlug ?? storeType ?? null;
  const businessTypeKey = String(storeType || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
  const styleName = BUSINESS_TYPE_TO_STYLE[businessTypeKey] || 'modern';
  const usedUrls = new Set();
  let serviceImageRegistry = null;
  try {
    const { ServiceImageRegistry } = await import('../media/serviceImageResolver.js');
    serviceImageRegistry = new ServiceImageRegistry();
  } catch {
    serviceImageRegistry = null;
  }
  let patched = 0;
  let billingLimitHit = false;
  const BATCH_SIZE = 5;

  itemBatch: for (let offset = 0; offset < idxList.length && !billingLimitHit; offset += BATCH_SIZE) {
    const batchIdx = idxList.slice(offset, offset + BATCH_SIZE);
    const settled = [];
    for (const i of batchIdx) {
      if (billingLimitHit) break itemBatch;
      const p = items[i];
      if (guardsEnabled && effectiveVerticalType === 'food' && isBlockedCandidateForFood(p.name, p.description)) {
        settled.push({ status: 'fulfilled', value: null });
        continue;
      }
      const catalogCategoryHint =
        p.categoryId && categories.length ? categories.find((c) => c.id === p.categoryId)?.name : null;
      let imageQueryHint = p?.imageQueryHint ?? null;
      try {
        const { resolveItemImageSearchQuery } = await import('./itemImageQueryResolver.js');
        imageQueryHint = resolveItemImageSearchQuery({
          itemName: p?.name,
          description: p?.description,
          imageQueryHint: p?.imageQueryHint,
          verticalSlug: verticalForItem,
          verticalGroup: effectiveImageFillProfile?.verticalGroup,
          businessType: storeType,
          storeName,
          categoryName: catalogCategoryHint,
        });
      } catch {
        const derivedHint = deriveItemCategoryHint(p?.name, verticalForItem, storeType);
        imageQueryHint = derivedHint || imageQueryHint;
      }
      const categoryHint =
        imageQueryHint ||
        [deriveItemCategoryHint(p?.name, verticalForItem, storeType), catalogCategoryHint].filter(Boolean).join(' ').trim() ||
        null;
      const opts = effectiveImageFillProfile
        ? {
            profile: effectiveImageFillProfile,
            imageQueryHint,
            categoryHint,
            categoryName: categoryHint,
            businessType: storeType || null,
            storeName,
            verticalSlug: verticalForItem,
            verticalGroup: effectiveImageFillProfile?.verticalGroup,
            usedUrls,
            serviceImageRegistry,
            allowNullOnLowConfidence: true,
            ...(locationStr ? { location: locationStr } : {}),
          }
        : {
            imageQueryHint,
            categoryName: categoryHint,
            businessType: storeType || null,
            storeName,
            verticalSlug: verticalForItem,
            usedUrls,
            serviceImageRegistry,
            allowNullOnLowConfidence: true,
            ...(locationStr ? { location: locationStr } : {}),
          };
      try {
        const result = await generateImageForDraftItem(p.name, p.description, styleName, opts);
        settled.push({ status: 'fulfilled', value: result });
        if (result?.url) usedUrls.add(result.url);
      } catch (err) {
        if (err?.code === 'BILLING_HARD_LIMIT') {
          billingLimitHit = true;
          settled.push({ status: 'rejected', reason: err });
          break;
        }
        settled.push({ status: 'rejected', reason: err });
      }
    }
    batchIdx.forEach((i, batchPos) => {
      const result = settled[batchPos];
      const item = items[i];
      if (result?.status === 'fulfilled' && result.value?.url && !resolveUsableDraftItemImageUrl(item)) {
        const img = result.value;
        item.imageUrl = img.url;
        item.imageSource = img.source;
        item.imageQuery = img.query;
        item.imageConfidence = img.confidence;
        if (img.imageSelection) item.imageSelection = img.imageSelection;
        if (img.imageMatchStatus) item.imageMatchStatus = img.imageMatchStatus;
        if (img.canonicalServiceTitle) item.canonicalServiceTitle = img.canonicalServiceTitle;
        patched += 1;
      }
    });
  }

  if (guardsEnabled && effectiveVerticalType) {
    applyItemGuards(items, effectiveVerticalType);
  }

  return { patched };
}
