/**
 * Menu validation and flattening for vertical-locked menu (MenuFirst path).
 * No AI dependency - safe to use in tests and from menuGenerationService.
 */

const SYSTEM_PROMPT = `You are Cardbey Menu Generator. You MUST generate a menu that matches the provided business vertical.
Return ONLY valid JSON that matches the schema. No markdown. No commentary.
Never include items outside the vertical. If unsure, choose safer, more generic items WITHIN the vertical.
Do not include any image URLs. Images are handled separately.

CRITICAL RULE — vertical discipline:
Generate ONLY products and services that businesses of the stated business type and vertical actually offer.
NEVER include items from other industries.

Examples of violations to avoid:
- A beauty salon must NOT include food/beverage items (no "House Special", "Seasonal Soup", "Side Salad")
- A signage company must NOT include branding/consulting services unless signage-related
- A car wash must NOT include food or beauty services

Every single item in your response must be something a customer would realistically buy from this specific type of business.`;

const USER_PROMPT_TEMPLATE = `Generate a complete menu for:
- Business Name: {BUSINESS_NAME}
- Business type: {BUSINESS_TYPE}
- Vertical: {VERTICAL}
- Location: {CITY_COUNTRY}
- Price Tier: {PRICE_TIER}

Generate ONLY {BUSINESS_TYPE} services/products (when the business type is specified). If the business type is unknown, follow the vertical strictly and stay within that industry.

Return ONLY valid JSON matching this exact schema (no other keys):
{
  "vertical": "{VERTICAL}",
  "currency": "{CURRENCY}",
  "categories": [
    {
      "name": "string",
      "subcategories": [
        {
          "name": "string",
          "items": [
            {
              "name": "string",
              "description": "string (8-20 words, specific to the vertical)",
              "price": "string (optional; omit if unknown)",
              "isService": false,
              "tags": ["string"]
            }
          ]
        }
      ]
    }
  ]
}

HARD CONSTRAINTS:
- 4-10 categories
- Each category has 1-4 subcategories (at least 1)
- Each subcategory has 1-12 items (at least 1, prefer 2+)
- Item names must be REAL (no "Product 1", "Retail 2", "Item A")
- NEVER include unrelated retail goods (e.g., shoes, handbags, jewelry) unless the vertical is explicitly fashion/retail
- For service verticals, set isService=true for services; for product verticals, set isService=false`;

/** Generic placeholder name patterns (reject). */
const GENERIC_ITEM_PATTERN = /^(general|retail|product|item)\s*\d*$/i;

/** Banned keywords per vertical. */
const BANNED_KEYWORDS_BY_VERTICAL = {
  sweets_bakery: ['shoe', 'shoes', 'handbag', 'bag', 'jewelry', 'watch', 'fashion', 'apparel', 'jeans', 'office', 'laptop'],
  sweets_store: ['shoe', 'shoes', 'handbag', 'bag', 'jewelry', 'watch', 'fashion', 'apparel', 'jeans', 'office', 'laptop'],
  cafe: ['shoe', 'shoes', 'handbag', 'jewelry', 'fashion', 'office', 'laptop'],
  nail_salon: ['shoe', 'shoes', 'handbag', 'cake', 'pastry', 'espresso', 'burger'],
  restaurant: ['shoe', 'shoes', 'handbag', 'jewelry', 'fashion', 'office'],
  barber: ['cake', 'pastry', 'espresso', 'dessert', 'pastry'],
  real_estate: ['espresso', 'cake', 'manicure', 'pedicure'],
  florist: ['shoe', 'shoes', 'handbag', 'espresso', 'burger'],
  // 'cake' omitted: compound names like "Birthday Cake Flowers" (flowers for a cake) are valid florist items
  // Fashion verticals — shoes/handbags/jewelry ARE valid fashion items
  fashion: ['espresso', 'burger', 'pizza', 'manicure', 'pedicure', 'plumbing'],
  'fashion.kids': ['espresso', 'burger', 'pizza', 'manicure', 'pedicure'],
  'fashion.women': ['espresso', 'burger', 'pizza', 'manicure', 'pedicure'],
  'fashion.men': ['espresso', 'burger', 'pizza', 'manicure', 'pedicure'],
  default: ['shoe', 'shoes', 'handbag', 'jewelry', 'fashion'],
};

/**
 * Validate: counts, no generic names, vertical relevance.
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateMenuOutput(parsed, vertical) {
  const errors = [];
  const v = (vertical || parsed?.vertical || 'default').toString().toLowerCase().replace(/\s+/g, '_');
  const bannedRaw = BANNED_KEYWORDS_BY_VERTICAL[v] || BANNED_KEYWORDS_BY_VERTICAL.default;
  // Never flag the store's own vertical tokens as off-vertical (e.g. Fashion → "fashion" in item text).
  const verticalTokens = new Set(v.split(/[^a-z0-9]+/).filter((t) => t.length >= 2));
  const banned = bannedRaw.filter((kw) => !verticalTokens.has(kw));

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, errors: ['Invalid JSON object'] };
  }
  if (!Array.isArray(parsed.categories) || parsed.categories.length === 0) {
    errors.push('categories must be a non-empty array');
  }
  if (parsed.categories) {
    if (parsed.categories.length < 4 || parsed.categories.length > 10) {
      errors.push(`Expected 4-10 categories, got ${parsed.categories.length}`);
    }
    for (let ci = 0; ci < parsed.categories.length; ci++) {
      const cat = parsed.categories[ci];
      const subs = cat?.subcategories;
      if (!Array.isArray(subs) || subs.length < 1 || subs.length > 4) {
        errors.push(`Category "${cat?.name}" must have 1-4 subcategories`);
      }
      for (let si = 0; subs && si < subs.length; si++) {
        const items = subs[si]?.items;
        if (!Array.isArray(items) || items.length < 1 || items.length > 12) {
          errors.push(`Subcategory "${subs[si]?.name}" must have 1-12 items`);
        }
        for (const it of items || []) {
          const name = (it?.name || '').toString().trim();
          if (GENERIC_ITEM_PATTERN.test(name)) {
            errors.push(`Generic item name not allowed: "${name}"`);
          }
          const desc = (it?.description || '').toString().toLowerCase();
          const combined = `${name} ${desc}`.toLowerCase();
          for (const kw of banned) {
            if (combined.includes(kw)) {
              errors.push(`Item "${name}" contains off-vertical keyword: "${kw}"`);
              break;
            }
          }
        }
      }
    }
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Flatten LLM output to preview shape: categories = [{ id, name }], items = [{ id, name, description, price, categoryId, imageUrl: null }].
 */
function flattenToPreviewShape(parsed, draftId) {
  const categories = [];
  const items = [];
  let globalItemIndex = 0;
  for (let ci = 0; ci < (parsed.categories || []).length; ci++) {
    const cat = parsed.categories[ci];
    const subs = cat?.subcategories || [];
    for (let si = 0; si < subs.length; si++) {
      const sub = subs[si];
      const catId = `cat_${ci}_${si}`;
      categories.push({
        id: catId,
        name: sub?.name || `Category ${ci + 1}`,
      });
      for (const it of sub?.items || []) {
        const itemId = `item_${draftId}_${globalItemIndex}`;
        const priceStr = it?.price != null ? String(it.price).trim() : null;
        const amount = priceStr ? parseFloat(priceStr.replace(/[^0-9.]/g, '')) : null;
        items.push({
          id: itemId,
          name: (it?.name || '').toString().trim() || `Item ${globalItemIndex + 1}`,
          description: (it?.description || '').toString().trim() || null,
          price: priceStr || null,
          priceV1: amount != null && !Number.isNaN(amount) ? { amount } : undefined,
          categoryId: catId,
          imageUrl: null,
          isService: !!it?.isService,
          tags: Array.isArray(it?.tags) ? it.tags : undefined,
        });
        globalItemIndex++;
      }
    }
  }
  return { categories, items };
}

export { validateMenuOutput, flattenToPreviewShape, BANNED_KEYWORDS_BY_VERTICAL, GENERIC_ITEM_PATTERN, SYSTEM_PROMPT, USER_PROMPT_TEMPLATE };
