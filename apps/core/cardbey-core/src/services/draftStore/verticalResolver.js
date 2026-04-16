/**
 * Vertical-safe draft generation: single source of truth for vertical slug and template selection.
 * Used by orchestra start and buildCatalog so AI and template paths never mismatch business type.
 */

/**
 * Normalize businessType/vertical for matching (lowercase, strip symbols, single spaces).
 * @param {string} [str]
 * @returns {string}
 */
function normalize(str) {
  if (str == null || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve a canonical vertical slug from businessType and optional vertical.
 * Order: beauty > fashion > food > furniture > generic.
 * @param {string} [businessType]
 * @param {string} [vertical]
 * @returns {'beauty'|'fashion'|'food'|'furniture'|'generic'}
 */
export function resolveVerticalSlug(businessType, vertical) {
  const combined = `${normalize(businessType)} ${normalize(vertical)}`.trim() || 'generic';
  if (/\b(nail|beauty|salon|spa|lash|wax|manicure|pedicure)\b/.test(combined)) return 'beauty';
  if (/\b(fashion|clothing|apparel|boutique|wear|dress|women|men)\b/.test(combined)) return 'fashion';
  if (/\b(cafe|coffee|banh mi|restaurant|food|bakery|florist|barista|espresso|pastry|sweets|dessert|confectionery)\b/.test(combined)) return 'food';
  if (/\b(furniture|homeware|homewares|interior|decor|sofa|mattress|table|cabinet|bedroom|living room)\b/.test(combined)) return 'furniture';
  return 'generic';
}

/**
 * Map vertical slug to templateId. HARD GUARD: only 'food' can use 'cafe'; non-food never get cafe.
 * @param {string} verticalSlug - from resolveVerticalSlug
 * @returns {string} templateId for templateItemsData / buildFromTemplate
 */
export function resolveTemplateId(verticalSlug) {
  const slug = (verticalSlug || 'generic').toLowerCase().trim();
  if (slug === 'food') return 'cafe';
  if (slug === 'beauty') return 'nail_salon';
  if (slug === 'fashion') return 'retail';
  if (slug === 'furniture') return 'generic_store';
  return 'generic_store';
}

/**
 * For non-food verticals: product name/description must not contain these (coffee/drinks/bakery).
 */
export const FORBIDDEN_KEYWORDS_NON_FOOD = /espresso|latte|cappuccino|coffee|americano|mocha|chai latte|flat white|cold brew|iced latte|matcha latte|tea\b|croissant|muffin|pastry|barista/i;

/**
 * Count how many products have forbidden keywords in name or description.
 * @param {{ name?: string, description?: string }[]} products
 * @returns {number}
 */
export function countForbiddenKeywordHits(products) {
  if (!Array.isArray(products)) return 0;
  return products.filter((p) => {
    const text = `${p.name || ''} ${p.description || ''}`;
    return FORBIDDEN_KEYWORDS_NON_FOOD.test(text);
  }).length;
}
