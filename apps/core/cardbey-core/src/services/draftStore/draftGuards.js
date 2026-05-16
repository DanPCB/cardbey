/**
 * Phase 2 draft generation guardrails: vertical correctness and de-generic naming.
 * Used only when ENABLE_DRAFT_GUARDS=true. No refactors; additive only.
 */

/**
 * Infer effective vertical from store/business type for guard logic.
 * @param {string} [storeType] - profile.type or storeType
 * @param {string} [businessType] - optional override
 * @returns {'food'|'florist'|'trades'|'products'|'services'}
 */
function effectiveVertical(storeType, businessType) {
  const raw = (businessType || storeType || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
  const tokens = raw.split(/[_\-\s]+/).filter(Boolean);

  const foodTokens = [
    'sweets', 'dessert', 'bakery', 'cafe', 'coffee', 'restaurant',
    'coffee_shop', 'coffee-shop', 'bar', 'bistro', 'kitchen',
  ];
  if (tokens.some((t) => foodTokens.includes(t))) return 'food';

  const floristTokens = ['florist', 'flowers', 'flower'];
  if (tokens.some((t) => floristTokens.includes(t))) return 'florist';

  const tradesTokens = ['plumbing', 'electrician', 'roofing', 'contractor', 'trade', 'hvac', 'landscaping'];
  if (tokens.some((t) => tradesTokens.includes(t))) return 'trades';

  return 'products';
}

/** For food vertical: block image if candidate text contains these (avoids off-vertical stock photos). */
const FOOD_BLOCKED_KEYWORDS = [
  'shoe', 'shoes', 'fashion', 'model', 'mannequin', 'office', 'interior',
  'portrait', 'jeans', 'clothing', 'apparel', 'watch', 'handbag', 'bag',
  'furniture', 'sofa', 'lamp', 'desk', 'laptop', 'phone', 'electronics',
  'car', 'vehicle', 'real estate', 'building', 'architecture',
];

/**
 * Normalize text for keyword check (lowercase, single spaces).
 * @param {string} [text]
 * @returns {string}
 */
function normalizeText(text) {
  return (text ?? '').toString().toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * True if candidate (item name/description) should not get an image for food vertical.
 * @param {string} name - Item name (title)
 * @param {string} [description] - Optional description
 * @param {string} [url] - Optional image URL (e.g. for path keywords); currently unused
 * @returns {boolean}
 */
function isBlockedCandidateForFood(name, description, url) {
  const combined = [normalizeText(name), normalizeText(description), (url || '').toLowerCase()].join(' ');
  if (!combined.trim()) return false;
  return FOOD_BLOCKED_KEYWORDS.some((kw) => combined.includes(kw));
}

/**
 * Apply vertical image guard: for food, set imageUrl to null when candidate is blocked.
 * Mutates items in place. When flag is off, caller does not call this.
 * @param {Array<{ name?: string, description?: string, imageUrl?: string | null }>} items
 * @param {string} vertical - effectiveVertical result
 */
function applyItemGuards(items, vertical) {
  if (!Array.isArray(items) || vertical !== 'food') return;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    if (isBlockedCandidateForFood(item.name, item.description, item.imageUrl)) {
      item.imageUrl = null;
    }
  }
}

/** Generic name pattern: "general 1", "retail 2", "product 3" */
const GENERIC_NAME_REGEX = /^(general|retail|product)\s*\d+$/i;

/** Minimum length to consider a name non-generic (avoid "A", "1", etc.) */
const MIN_NAME_LENGTH = 3;

/**
 * Default item name by vertical when we replace a generic name (category-agnostic fallback).
 */
const VERTICAL_DEFAULT_NAMES = {
  food: 'Fresh Juice',
  florist: 'Arrangement',
  trades: 'Service',
  products: 'Product',
  services: 'Service',
};

/**
 * Replace generic or too-short item names with vertical default or "CategoryLabel N".
 * Mutates items in place. Call before returning preview.
 * @param {Array<{ name?: string, categoryId?: string }>} items
 * @param {string} vertical - effectiveVertical result
 * @param {Array<{ id: string, name?: string }>} categories - preview.categories
 */
function applyNameGuards(items, vertical, categories = []) {
  if (!Array.isArray(items)) return;
  const categoryById = new Map((categories || []).map((c) => [c && c.id, c]));
  const defaultLabel = VERTICAL_DEFAULT_NAMES[vertical] || VERTICAL_DEFAULT_NAMES.products;

  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const name = (item.name ?? '').toString().trim();
    const isGeneric = GENERIC_NAME_REGEX.test(name) || (name.length > 0 && name.length < MIN_NAME_LENGTH);
    if (!isGeneric) return;

    const cat = item.categoryId ? categoryById.get(item.categoryId) : null;
    const categoryLabel = (cat && (cat.name || cat.label)) ? String(cat.name || cat.label).trim() : defaultLabel;
    item.name = `${categoryLabel} ${index + 1}`;
  });
}

function isDraftGuardsEnabled() {
  return process.env.ENABLE_DRAFT_GUARDS === 'true' || process.env.ENABLE_DRAFT_GUARDS === '1';
}

export {
  effectiveVertical,
  isBlockedCandidateForFood,
  applyItemGuards,
  applyNameGuards,
  isDraftGuardsEnabled,
  FOOD_BLOCKED_KEYWORDS,
  GENERIC_NAME_REGEX,
};
