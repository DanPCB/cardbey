/**
 * Canonical business category taxonomy for Related on Cardbey.
 * TAXONOMY_VERSION bumps invalidate related recommendation caches.
 */

export const TAXONOMY_VERSION = '2026-07-28.1';
export const RANKING_VERSION = '2026-07-28.1';

/** @typedef {'FOOD_AND_DRINK'|'BEAUTY_AND_WELLNESS'|'HOME_AND_GARDEN'|'PROFESSIONAL_SERVICES'|'RETAIL'|'HEALTH'|'ENTERTAINMENT'|'OTHER'} BusinessCategory */

export const BUSINESS_CATEGORIES = Object.freeze([
  'FOOD_AND_DRINK',
  'BEAUTY_AND_WELLNESS',
  'HOME_AND_GARDEN',
  'PROFESSIONAL_SERVICES',
  'RETAIL',
  'HEALTH',
  'ENTERTAINMENT',
  'OTHER',
]);

/** Legacy / free-text labels → canonical category (exact normalised keys only). */
const CATEGORY_ALIASES = Object.freeze({
  food: 'FOOD_AND_DRINK',
  'food & drink': 'FOOD_AND_DRINK',
  'food and drink': 'FOOD_AND_DRINK',
  food_and_drink: 'FOOD_AND_DRINK',
  restaurant: 'FOOD_AND_DRINK',
  restaurants: 'FOOD_AND_DRINK',
  cafe: 'FOOD_AND_DRINK',
  café: 'FOOD_AND_DRINK',
  coffee: 'FOOD_AND_DRINK',
  takeaway: 'FOOD_AND_DRINK',
  'take away': 'FOOD_AND_DRINK',
  'fast food': 'FOOD_AND_DRINK',
  fast_food: 'FOOD_AND_DRINK',
  bakery: 'FOOD_AND_DRINK',
  bar: 'FOOD_AND_DRINK',
  pub: 'FOOD_AND_DRINK',
  hospitality: 'FOOD_AND_DRINK',
  dining: 'FOOD_AND_DRINK',
  kitchen: 'FOOD_AND_DRINK',
  chicken: 'FOOD_AND_DRINK',
  korean: 'FOOD_AND_DRINK',
  vietnamese: 'FOOD_AND_DRINK',
  thai: 'FOOD_AND_DRINK',
  japanese: 'FOOD_AND_DRINK',
  chinese: 'FOOD_AND_DRINK',
  indian: 'FOOD_AND_DRINK',
  greek: 'FOOD_AND_DRINK',
  pizza: 'FOOD_AND_DRINK',
  burger: 'FOOD_AND_DRINK',
  bbq: 'FOOD_AND_DRINK',
  'korean bbq': 'FOOD_AND_DRINK',
  pho: 'FOOD_AND_DRINK',
  beauty: 'BEAUTY_AND_WELLNESS',
  beauty_and_wellness: 'BEAUTY_AND_WELLNESS',
  wellness: 'BEAUTY_AND_WELLNESS',
  barber: 'BEAUTY_AND_WELLNESS',
  barbershop: 'BEAUTY_AND_WELLNESS',
  salon: 'BEAUTY_AND_WELLNESS',
  hair: 'BEAUTY_AND_WELLNESS',
  massage: 'BEAUTY_AND_WELLNESS',
  spa: 'BEAUTY_AND_WELLNESS',
  nails: 'BEAUTY_AND_WELLNESS',
  beauty_salon: 'BEAUTY_AND_WELLNESS',
  home: 'HOME_AND_GARDEN',
  home_and_garden: 'HOME_AND_GARDEN',
  garden: 'HOME_AND_GARDEN',
  furniture: 'HOME_AND_GARDEN',
  construction: 'HOME_AND_GARDEN',
  trades: 'HOME_AND_GARDEN',
  plumber: 'HOME_AND_GARDEN',
  electrician: 'HOME_AND_GARDEN',
  services: 'PROFESSIONAL_SERVICES',
  professional_services: 'PROFESSIONAL_SERVICES',
  professional: 'PROFESSIONAL_SERVICES',
  consulting: 'PROFESSIONAL_SERVICES',
  accounting: 'PROFESSIONAL_SERVICES',
  legal: 'PROFESSIONAL_SERVICES',
  retail: 'RETAIL',
  products: 'RETAIL',
  fashion: 'RETAIL',
  apparel: 'RETAIL',
  clothing: 'RETAIL',
  ecommerce: 'RETAIL',
  'e-commerce': 'RETAIL',
  shop: 'RETAIL',
  health: 'HEALTH',
  medical: 'HEALTH',
  dental: 'HEALTH',
  clinic: 'HEALTH',
  pharmacy: 'HEALTH',
  entertainment: 'ENTERTAINMENT',
  events: 'ENTERTAINMENT',
  music: 'ENTERTAINMENT',
  other: 'OTHER',
  others: 'OTHER',
  general: 'OTHER',
});

const SUBCATEGORY_ALIASES = Object.freeze({
  restaurant: 'RESTAURANT',
  restaurants: 'RESTAURANT',
  cafe: 'CAFE',
  café: 'CAFE',
  coffee: 'CAFE',
  takeaway: 'TAKEAWAY',
  'take away': 'TAKEAWAY',
  'fast food': 'FAST_FOOD',
  fast_food: 'FAST_FOOD',
  barber: 'BARBER',
  barbershop: 'BARBER',
  massage: 'MASSAGE',
  spa: 'MASSAGE',
  furniture: 'FURNITURE',
  salon: 'SALON',
  bakery: 'BAKERY',
  bar: 'BAR',
});

const CUISINE_TOKENS = Object.freeze([
  'CHICKEN',
  'KOREAN',
  'VIETNAMESE',
  'THAI',
  'GREEK',
  'JAPANESE',
  'CHINESE',
  'INDIAN',
  'ITALIAN',
  'MEXICAN',
  'LEBANESE',
  'TURKISH',
  'MALAYSIAN',
  'INDONESIAN',
  'PIZZA',
  'BURGER',
  'BBQ',
  'SUSHI',
  'RAMEN',
  'PHO',
]);

/** Pairs that must never fill Related while same-category inventory exists. */
const INCOMPATIBLE_PAIRS = Object.freeze([
  ['FOOD_AND_DRINK', 'BEAUTY_AND_WELLNESS'],
  ['FOOD_AND_DRINK', 'HOME_AND_GARDEN'],
  ['FOOD_AND_DRINK', 'PROFESSIONAL_SERVICES'],
  ['FOOD_AND_DRINK', 'RETAIL'],
  ['FOOD_AND_DRINK', 'HEALTH'],
  ['BEAUTY_AND_WELLNESS', 'HOME_AND_GARDEN'],
  ['BEAUTY_AND_WELLNESS', 'RETAIL'],
  ['HEALTH', 'RETAIL'],
  ['HEALTH', 'HOME_AND_GARDEN'],
]);

/** Soft adjacency used only when same-category inventory is insufficient. */
const COMPLEMENTARY = Object.freeze({
  FOOD_AND_DRINK: ['ENTERTAINMENT'],
  BEAUTY_AND_WELLNESS: ['HEALTH', 'RETAIL'],
  RETAIL: ['HOME_AND_GARDEN'],
  HOME_AND_GARDEN: ['RETAIL', 'PROFESSIONAL_SERVICES'],
  PROFESSIONAL_SERVICES: ['HOME_AND_GARDEN'],
  HEALTH: ['BEAUTY_AND_WELLNESS'],
  ENTERTAINMENT: ['FOOD_AND_DRINK'],
  OTHER: [],
});

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTaxonomyKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {unknown} raw
 * @returns {BusinessCategory}
 */
export function normalizeBusinessCategory(raw) {
  const key = normalizeTaxonomyKey(raw);
  if (!key) return 'OTHER';
  if (BUSINESS_CATEGORIES.includes(/** @type {any} */ (String(raw ?? '').trim().toUpperCase()))) {
    return /** @type {BusinessCategory} */ (String(raw).trim().toUpperCase());
  }
  if (CATEGORY_ALIASES[key]) return CATEGORY_ALIASES[key];
  // Multi-token: prefer first strong alias hit by longest key
  const hits = Object.keys(CATEGORY_ALIASES)
    .filter((alias) => key === alias || key.includes(alias))
    .sort((a, b) => b.length - a.length);
  if (hits.length > 0) return CATEGORY_ALIASES[hits[0]];
  return 'OTHER';
}

/**
 * @param {unknown} raw
 * @param {BusinessCategory} [category]
 * @returns {string | null}
 */
export function normalizeBusinessSubcategory(raw, category) {
  const key = normalizeTaxonomyKey(raw);
  if (!key) return null;
  if (SUBCATEGORY_ALIASES[key]) return SUBCATEGORY_ALIASES[key];
  const upper = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  if (/^[A-Z][A-Z0-9_]+$/.test(upper) && upper.length < 40) return upper;
  if (category === 'FOOD_AND_DRINK') {
    if (key.includes('cafe') || key.includes('coffee')) return 'CAFE';
    if (key.includes('takeaway') || key.includes('take away')) return 'TAKEAWAY';
    if (key.includes('fast food')) return 'FAST_FOOD';
    if (key.includes('restaurant') || key.includes('dining')) return 'RESTAURANT';
  }
  if (category === 'BEAUTY_AND_WELLNESS') {
    if (key.includes('barber')) return 'BARBER';
    if (key.includes('massage') || key.includes('spa')) return 'MASSAGE';
    if (key.includes('salon')) return 'SALON';
  }
  return null;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function extractCuisineHints(...parts) {
  const blob = parts
    .map((p) => normalizeTaxonomyKey(p))
    .filter(Boolean)
    .join(' ');
  if (!blob) return [];
  const out = [];
  for (const token of CUISINE_TOKENS) {
    const needle = token.toLowerCase().replace(/_/g, ' ');
    if (blob.includes(needle)) out.push(token);
  }
  return out;
}

/**
 * @param {BusinessCategory} a
 * @param {BusinessCategory} b
 */
export function areCategoriesIncompatible(a, b) {
  if (!a || !b || a === 'OTHER' || b === 'OTHER') return false;
  if (a === b) return false;
  return INCOMPATIBLE_PAIRS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}

/**
 * @param {BusinessCategory} a
 * @param {BusinessCategory} b
 */
export function areCategoriesComplementary(a, b) {
  if (!a || !b || a === b) return false;
  const list = COMPLEMENTARY[a] || [];
  return list.includes(b);
}

/**
 * Resolve taxonomy fields from a store-like record.
 * @param {Record<string, unknown>} store
 */
export function resolveStoreTaxonomy(store) {
  const type = store?.type ?? store?.businessType ?? store?.businessCategory ?? '';
  const category = normalizeBusinessCategory(type);
  const subcategory = normalizeBusinessSubcategory(
    store?.subcategory ?? store?.businessSubcategory ?? type,
    category,
  );
  const cuisine = extractCuisineHints(
    type,
    store?.name,
    store?.description,
    store?.tagline,
    store?.cuisine,
  );
  const location = {
    suburb: String(store?.suburb ?? '').trim() || null,
    city: String(store?.city ?? store?.location ?? '').trim() || null,
  };
  return { category, subcategory, cuisine, location };
}

/**
 * Build related-recommendation cache key.
 * @param {{ storeId: string, category: string, subcategory?: string | null, location?: { suburb?: string | null, city?: string | null } }} ctx
 */
export function buildRelatedCacheKey(ctx) {
  const suburb = ctx.location?.suburb || '';
  const city = ctx.location?.city || '';
  return [
    'related',
    TAXONOMY_VERSION,
    RANKING_VERSION,
    ctx.storeId,
    ctx.category,
    ctx.subcategory || '',
    suburb,
    city,
  ].join('|');
}
