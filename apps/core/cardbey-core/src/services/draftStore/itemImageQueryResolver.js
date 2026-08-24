/**
 * Resolve Pexels/search queries per catalog item from industry blueprints and titles.
 * Item-specific queries beat generic vertical/store keywords for image relevance.
 */

import {
  INDUSTRY_BLUEPRINTS,
  resolveIndustryBlueprintKey,
  getIndustryWebsiteCopy,
  deriveDefaultImageQueryHint,
} from './industryBlueprintRegistry.js';
import {
  buildServiceImageIntent,
  canonicalizeServiceTitle,
} from '../media/serviceImageIntentResolver.js';
import { enrichImageQueryWithBusinessContext } from '../../lib/mission001/fidelityPreReveal.js';

const SUFFIX_RE = /\s+(- chef'?s|- special|- house|- style [a-z]|- option \d+)$/i;

/** Re-export for callers that already import from here. */
export {
  canonicalizeServiceTitle,
  buildServiceImageIntent,
  normalizeServiceKey,
} from '../media/serviceImageIntentResolver.js';

function normalizeItemName(name) {
  return canonicalizeServiceTitle(name).toLowerCase();
}

/**
 * @param {string} itemName
 * @param {object} profile
 */
export function resolveBlueprintItemImageHint(itemName, profile = {}) {
  const key = resolveIndustryBlueprintKey(profile);
  const bank = key ? INDUSTRY_BLUEPRINTS[key] : null;
  if (!bank?.items?.length) return null;

  const norm = normalizeItemName(itemName);
  if (!norm) return null;

  const exact = bank.items.find((i) => normalizeItemName(i.name) === norm);
  if (exact?.imageQueryHint) return exact.imageQueryHint;

  const partial = bank.items.find((i) => {
    const base = normalizeItemName(i.name);
    return base && (norm.startsWith(base) || base.startsWith(norm));
  });
  if (partial?.imageQueryHint) return partial.imageQueryHint;

  return null;
}

/**
 * @param {object} params
 */
export function resolveItemImageSearchQuery(params = {}) {
  const {
    itemName,
    description,
    imageQueryHint,
    verticalSlug,
    verticalGroup,
    businessType,
    storeName,
    categoryName,
    location,
  } = params;

  const explicit = String(imageQueryHint ?? '').trim();
  if (explicit) {
    return enrichImageQueryWithBusinessContext(explicit.slice(0, 200), {
      businessName: storeName,
      storeName,
      businessType,
      category: categoryName ?? businessType,
      location,
    });
  }

  const profile = {
    verticalSlug,
    verticalGroup,
    businessType,
    storeType: businessType,
    storeName,
    businessName: storeName,
  };

  const fromBlueprint = resolveBlueprintItemImageHint(itemName, profile);
  if (fromBlueprint) {
    return enrichImageQueryWithBusinessContext(fromBlueprint.slice(0, 200), {
      businessName: storeName,
      storeName,
      businessType,
      category: categoryName ?? businessType,
      location,
    });
  }

  try {
    const intent = buildServiceImageIntent({
      serviceName: itemName,
      description,
      businessCategory: businessType ?? categoryName,
      businessSubcategory: verticalSlug,
    });
    if (intent.queries?.[0]) {
      return enrichImageQueryWithBusinessContext(intent.queries[0].slice(0, 200), {
        businessName: storeName,
        storeName,
        businessType,
        category: categoryName ?? businessType,
        location,
      });
    }
  } catch {
    /* fall through */
  }

  const key = resolveIndustryBlueprintKey(profile);
  const bank = key ? INDUSTRY_BLUEPRINTS[key] : null;
  if (bank) {
    const derived = deriveDefaultImageQueryHint(itemName, bank);
    if (derived) {
      return enrichImageQueryWithBusinessContext(derived.slice(0, 200), {
        businessName: storeName,
        storeName,
        businessType,
        category: categoryName ?? businessType,
        location,
      });
    }
  }

  const name = String(itemName ?? '').trim();
  let fallback = 'professional service';
  if (name && categoryName) fallback = `${name} ${categoryName}`.replace(/\s+/g, ' ');
  else if (name) fallback = name;
  else if (description) fallback = String(description).trim();

  return enrichImageQueryWithBusinessContext(fallback.slice(0, 200), {
    businessName: storeName,
    storeName,
    businessType,
    category: categoryName ?? businessType,
    location,
  });
}

/**
 * Hero banner search query from industry blueprint (falls back to store name + category).
 * @param {object} params
 */
export function resolveHeroImageSearchQuery(params = {}) {
  const { storeName, businessType, storeType, verticalSlug, verticalGroup } = params;
  const copy = getIndustryWebsiteCopy({
    businessName: storeName,
    storeName,
    businessType: businessType ?? storeType,
    storeType: storeType ?? businessType,
    verticalSlug,
    verticalGroup,
  });
  const hero = copy?.heroImageKeywords?.[0];
  if (hero) return `${hero} hero banner`.slice(0, 200);

  const name = String(storeName ?? '').toLowerCase();
  if (/\b(handyman|handy[\s-]?man)\b/.test(name)) {
    return 'handyman home repair tools contractor hero banner';
  }
  if (
    /\b(capital|finance|financial|investment|private equity|wealth|asset management|venture)\b/.test(
      name,
    )
  ) {
    return 'corporate finance office modern skyline hero banner';
  }
  if (/\b(consulting|consultant|advisory)\b/.test(name)) {
    return 'business consulting meeting modern office hero banner';
  }

  return null;
}

/**
 * Forbidden stock-photo terms when vertical is not food (reduces bakery/cafe leakage).
 * @param {object} profile
 */
export function resolveIndustryForbiddenImageKeywords(profile = {}) {
  const key = resolveIndustryBlueprintKey(profile);
  const bank = key ? INDUSTRY_BLUEPRINTS[key] : null;
  const industry = bank?.industry || '';
  const slug = String(profile.verticalSlug ?? '').toLowerCase();
  const isFood = industry === 'food' || slug.startsWith('food.') || profile.verticalGroup === 'food';
  if (isFood) return [];

  return [
    'bakery',
    'pastry',
    'donut',
    'doughnut',
    'croissant',
    'cafe',
    'coffee shop',
    'espresso',
    'pizza',
    'sushi',
    'burger',
  ];
}

/**
 * Profile keywords for hero/item context — industry-specific, not generic interior.
 * @param {object} params
 */
export function resolveIndustryImageFillKeywords(params = {}) {
  const copy = getIndustryWebsiteCopy({
    businessName: params.storeName ?? params.businessName,
    storeName: params.storeName ?? params.businessName,
    businessType: params.businessType ?? params.storeType,
    storeType: params.storeType ?? params.businessType,
    verticalSlug: params.verticalSlug,
    verticalGroup: params.verticalGroup,
  });
  if (copy?.heroImageKeywords?.length) return copy.heroImageKeywords.slice(0, 4);
  return [];
}
