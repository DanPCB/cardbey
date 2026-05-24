/**
 * Key-based selection only. Returns one Seed Library image URL for the given category/vertical/orientation.
 * Used as fallback when hero or item image is missing. Never used for primary resolution; never index-based.
 *
 * Hero search queries: business name keywords override category pill when they conflict.
 */

import { getPrismaClient } from '../../lib/prisma.js';

/** Business-name keyword overrides — win over category pill for hero query and seed keys. */
export const BUSINESS_NAME_OVERRIDES = [
  {
    keywords: ['sign', 'signs', 'signage', 'banner', 'display', 'neon', 'vinyl'],
    query: 'business signage neon signs storefront',
    vertical: 'services',
    categoryKey: 'signage',
  },
  {
    keywords: ['bakery', 'bake', 'baked', 'bread', 'pastry', 'cake', 'patisserie', 'boulanger', 'boulangerie'],
    query: 'bakery fresh bread pastry shop',
    vertical: 'food',
    categoryKey: 'bakery',
  },
  {
    keywords: ['café', 'cafe', 'coffee', 'espresso', 'barista'],
    query: 'cafe coffee shop interior',
    vertical: 'food',
    categoryKey: 'cafe',
  },
  {
    keywords: ['salon', 'hair', 'nails', 'beauty', 'spa'],
    query: 'hair salon beauty spa',
    vertical: 'beauty',
    categoryKey: 'salon',
  },
  {
    keywords: ['gym', 'fitness', 'yoga', 'pilates', 'personal trainer'],
    query: 'gym fitness studio',
    vertical: 'services',
    categoryKey: 'fitness',
  },
  {
    keywords: ['law', 'legal', 'solicitor', 'lawyer', 'attorney'],
    query: 'law office professional',
    vertical: 'services',
    categoryKey: 'professional',
  },
  {
    keywords: ['fashion', 'boutique', 'apparel', 'clothing', 'wear'],
    query: 'fashion boutique clothing store',
    vertical: 'products',
    categoryKey: 'fashion',
  },
];

const CATEGORY_HERO_QUERIES = {
  fashion: 'fashion boutique clothing store',
  'arts & crafts': 'creative studio artisan workshop',
  arts_and_crafts: 'creative studio artisan workshop',
  'arts and crafts': 'creative studio artisan workshop',
  food: 'restaurant cafe interior',
  cafe: 'cafe coffee shop interior',
  coffee: 'cafe coffee shop interior',
  restaurant: 'restaurant dining interior',
  bakery: 'bakery pastry shop',
  beauty: 'hair salon beauty spa',
  services: 'professional services office',
  retail: 'retail store interior',
  default: 'small business storefront',
};

function normalizeCategoryKey(category) {
  return String(category ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * @param {string | null | undefined} businessName
 * @param {string | null | undefined} category
 * @returns {boolean}
 */
export function businessNameOverridesHeroCategory(businessName, category) {
  const nameLower = String(businessName ?? '').toLowerCase();
  if (!nameLower.trim()) return false;
  for (const override of BUSINESS_NAME_OVERRIDES) {
    if (override.keywords.some((kw) => nameLower.includes(kw))) return true;
  }
  return false;
}

/**
 * Pexels/search subject for hero generation. Business name wins over category pill.
 *
 * @param {string | null | undefined} businessName
 * @param {string | null | undefined} category
 * @returns {string}
 */
export function resolveHeroQuery(businessName, category) {
  const nameLower = String(businessName ?? '').toLowerCase();
  for (const override of BUSINESS_NAME_OVERRIDES) {
    if (override.keywords.some((kw) => nameLower.includes(kw))) {
      return override.query;
    }
  }
  const key = normalizeCategoryKey(category);
  if (
    key &&
    (key.includes('bakery') ||
      key.includes('pastry') ||
      key.includes('patisserie') ||
      key.includes('boulanger'))
  ) {
    return CATEGORY_HERO_QUERIES.bakery;
  }
  if (key && CATEGORY_HERO_QUERIES[key]) return CATEGORY_HERO_QUERIES[key];
  const underscored = key.replace(/\s+/g, '_').replace(/&/g, 'and');
  if (underscored && CATEGORY_HERO_QUERIES[underscored]) return CATEGORY_HERO_QUERIES[underscored];
  if (key === 'food & drink' || key === 'food and drink') {
    return CATEGORY_HERO_QUERIES.food;
  }
  return CATEGORY_HERO_QUERIES.default;
}

/**
 * @param {string | null | undefined} businessName
 * @param {string | null | undefined} category
 * @returns {string}
 */
export function resolveHeroSearchSubject(businessName, category) {
  return `${resolveHeroQuery(businessName, category)} hero banner`;
}

/** Keyword → seed categoryKey for menu item thumbnails (coffee menus, cafe food). */
export const COFFEE_MENU_OVERRIDES = [
  {
    keywords: [
      'flat white',
      'latte',
      'cafe latte',
      'cappuccino',
      'espresso',
      'coffee',
      'mocha',
      'mochacino',
      'mochaccino',
      'macchiato',
      'americano',
      'americino',
      'cortado',
      'piccolo',
      'batch brew',
      'long black',
      'chocolate ice',
      'red velvet',
      'hot chocolate',
    ],
    categoryKey: 'coffee',
    vertical: 'food',
  },
  {
    keywords: ['cake', 'muffin', 'pastry', 'croissant', 'scone', 'brownie', 'cookie', 'donut', 'doughnut'],
    categoryKey: 'bakery',
    vertical: 'food',
  },
  {
    keywords: ['sandwich', 'toast', 'breakfast', 'eggs', 'bagel', 'wrap', 'panini'],
    categoryKey: 'food',
    vertical: 'food',
  },
  {
    keywords: ['smoothie', 'juice', 'tea', 'chai', 'chocolate', 'hot chocolate', 'matcha', 'frappe', 'shake'],
    categoryKey: 'cafe',
    vertical: 'food',
  },
];

/**
 * Resolve seed-library keys for a single menu line item (name + category).
 *
 * @param {string | null | undefined} itemName
 * @param {string | null | undefined} category
 * @param {string | null | undefined} [businessName]
 * @returns {{ categoryKey: string | null; vertical: string | null }}
 */
export function resolveMenuItemSeedKeys(itemName, category, businessName) {
  const hay = `${String(itemName ?? '')} ${String(category ?? '')}`.toLowerCase();
  for (const row of COFFEE_MENU_OVERRIDES) {
    if (row.keywords.some((kw) => hay.includes(kw))) {
      return { categoryKey: row.categoryKey, vertical: row.vertical };
    }
  }
  const fromBusiness = resolveSeedImageCategoryKeys(businessName, category);
  if (fromBusiness.categoryKey || fromBusiness.vertical) return fromBusiness;
  const key = normalizeCategoryKey(category);
  if (key && CATEGORY_HERO_QUERIES[key]) {
    return { categoryKey: key.replace(/\s+/g, '_'), vertical: 'food' };
  }
  return { categoryKey: key || 'food', vertical: 'food' };
}

/**
 * Seed image URL for an extracted menu item (sync-friendly fallback before Pexels enrich).
 *
 * @param {{ name?: string | null; category?: string | null; businessName?: string | null }} item
 * @returns {Promise<string | null>}
 */
export async function getSeedImageForMenuItem(item) {
  const { categoryKey, vertical } = resolveMenuItemSeedKeys(
    item?.name,
    item?.category,
    item?.businessName,
  );
  for (const orientation of [null, 'landscape', 'square']) {
    for (const key of [categoryKey, 'coffee', 'cafe', 'food'].filter((k, i, a) => k && a.indexOf(k) === i)) {
      const url = await getSeedImageForCategory({
        categoryKey: key,
        vertical: vertical || 'food',
        businessName: item?.businessName ?? null,
        orientation,
      });
      if (url) return url;
    }
  }
  return null;
}

/**
 * Seed-library lookup keys when hero Pexels generation fails.
 *
 * @param {string | null | undefined} businessName
 * @param {string | null | undefined} categoryKey
 * @returns {{ vertical: string | null; categoryKey: string | null }}
 */
export function resolveSeedImageCategoryKeys(businessName, categoryKey) {
  const nameLower = String(businessName ?? '').toLowerCase();
  for (const override of BUSINESS_NAME_OVERRIDES) {
    if (override.keywords.some((kw) => nameLower.includes(kw))) {
      return {
        vertical: override.vertical ?? null,
        categoryKey: override.categoryKey ?? null,
      };
    }
  }
  const key = normalizeCategoryKey(categoryKey);
  return { vertical: null, categoryKey: key || null };
}

/**
 * Get a single seed image URL for placeholder/fallback use.
 * Selection is strictly by categoryKey, vertical, orientation (key-based). No array index.
 *
 * @param {{ categoryKey?: string | null; vertical?: string | null; orientation?: string | null; businessName?: string | null }} opts
 * @returns {Promise<string | null>} URL (from SeedAssetFile) or null if none found
 */
export async function getSeedImageForCategory(opts = {}) {
  const { orientation = null, businessName = null } = opts;
  let { categoryKey = null, vertical = null } = opts;

  if (businessName) {
    const resolved = resolveSeedImageCategoryKeys(businessName, categoryKey);
    if (resolved.vertical) vertical = resolved.vertical;
    if (resolved.categoryKey) categoryKey = resolved.categoryKey;
  }

  const prisma = getPrismaClient();

  const where = { status: 'active' };
  if (vertical && String(vertical).trim()) where.vertical = String(vertical).trim();
  if (categoryKey && String(categoryKey).trim()) where.categoryKey = String(categoryKey).trim();
  if (orientation && String(orientation).trim()) where.orientation = String(orientation).trim();

  const asset = await prisma.seedAsset.findFirst({
    where,
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  if (!asset) return null;

  const file = await prisma.seedAssetFile.findFirst({
    where: { seedAssetId: asset.id, role: { in: ['full', 'medium'] } },
    orderBy: { role: 'asc' },
  });

  if (!file || !file.fileUrl) return null;

  const url = file.fileUrl.trim();
  return url || null;
}
