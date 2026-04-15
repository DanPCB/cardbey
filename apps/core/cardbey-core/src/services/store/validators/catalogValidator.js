/**
 * Universal catalog validator + correction: coffee leakage, kids/adult, food-structure leak, seafood/cafe.
 * Single integration at end of catalog generation; rebuild via buildSeedCatalog when mismatch.
 */

const COFFEE_KEYWORDS = ['espresso', 'latte', 'cappuccino', 'coffee', 'mocha', 'flat white', 'cold brew', 'croissant', 'muffin', 'chai', 'tea', 'matcha', 'iced coffee'];
const COFFEE_REGEX = new RegExp(COFFEE_KEYWORDS.map((k) => `\\b${k.replace(/\s+/g, '\\s+')}\\b`).join('|'), 'i');

/** Kids audience: forbid adult-focused terms. >=1 hit = mismatch. */
const KIDS_ADULT_REGEX = /\b(men's|mens|women's|womens|heels|lingerie|formal suit|dress shirt|leather boots|adult|workwear)\b/i;

/** Food-structure category names that must not appear in services/retail. */
const FOOD_STRUCTURE_NAMES = ['starters', 'mains', 'mains course', 'desserts', 'sides', 'appetizers', 'entrees'];

function countHits(products, regex) {
  if (!Array.isArray(products)) return 0;
  return products.filter((p) => regex.test(`${p.name || ''} ${p.description || ''}`)).length;
}

function categoryNames(catalog) {
  const cats = catalog?.categories || [];
  return cats.map((c) => (c?.name || '').toLowerCase()).filter(Boolean);
}

/**
 * Validate catalog against profile. Thresholds: >=2 coffee for non-food/non-cafe; >=1 adult for kids; food structure in services/retail; >=1 cafe in seafood.
 * @param {{ verticalGroup?: string, verticalSlug?: string, audience?: string }} profile
 * @param {{ products?: { name?: string, description?: string }[], categories?: { name?: string }[] }} catalog
 * @returns {{ ok: boolean, reasons: string[], hits: { coffee?: number, kidsAdult?: number, foodStructure?: boolean, seafoodCafe?: number } }}
 */
export function validateCatalog(profile, catalog) {
  const reasons = [];
  const hits = {};
  const products = catalog?.products || [];
  const group = (profile?.verticalGroup || '').toLowerCase();
  const slug = (profile?.verticalSlug || '').toLowerCase();
  const audience = (profile?.audience || '').toLowerCase();
  const isFood = group === 'food' || slug.startsWith('food.');
  const isCafe = slug === 'food.cafe';
  const isSeafood = slug === 'food.seafood';
  const isServicesOrRetail = group === 'services' || group === 'retail' || group === 'fashion' || group === 'beauty';

  if (products.length === 0) {
    return { ok: true, reasons: [], hits: {} };
  }

  // Coffee leakage: non-food or (food but not cafe)
  if (!isFood || !isCafe) {
    const coffeeHits = countHits(products, COFFEE_REGEX);
    hits.coffee = coffeeHits;
    if (coffeeHits >= 2) {
      reasons.push(`Coffee/cafe leakage: ${coffeeHits} hits in non-food/non-cafe catalog`);
    }
  }

  // Kids audience: adult leakage
  if (audience === 'kids') {
    const kidsAdultHits = countHits(products, KIDS_ADULT_REGEX);
    hits.kidsAdult = kidsAdultHits;
    if (kidsAdultHits >= 1) {
      reasons.push(`Kids audience: ${kidsAdultHits} adult-focused item(s)`);
    }
  }

  // Food structure leak into services/retail
  if (isServicesOrRetail) {
    const names = categoryNames(catalog);
    const hasFoodStructure = FOOD_STRUCTURE_NAMES.some((f) => names.some((n) => n.includes(f) || f.includes(n)));
    hits.foodStructure = hasFoodStructure;
    if (hasFoodStructure) {
      reasons.push('Food-structure categories found in services/retail catalog');
    }
  }

  // Seafood must not contain cafe drinks
  if (isSeafood) {
    const seafoodCafeHits = countHits(products, COFFEE_REGEX);
    hits.seafoodCafe = seafoodCafeHits;
    if (seafoodCafeHits >= 1) {
      reasons.push(`Seafood catalog must not contain cafe drinks: ${seafoodCafeHits} hit(s)`);
    }
  }

  const ok = reasons.length === 0;
  return { ok, reasons, hits };
}

/**
 * Validate and correct: on mismatch replace catalog with rebuilt seed (same profile). rebuildFn defaults to buildSeedCatalog(profile).
 * @param {{ verticalGroup?: string, verticalSlug?: string, audience?: string }} profile
 * @param {{ profile: object, categories: array, products: array, meta?: object }} catalog - full CatalogBuildResult
 * @param {() => { categories: array, items: array, imageQueryHints?: object, meta?: object } | Promise<object>} [rebuildFn] - returns seed builder output (sync or async)
 * @returns {Promise<{ catalog: object, corrected: boolean, reasons: string[] }>}
 */
export async function validateAndCorrect(profile, catalog, rebuildFn) {
  const validation = validateCatalog(profile, catalog);
  if (validation.ok) {
    return { catalog, corrected: false, reasons: [] };
  }

  const fn = typeof rebuildFn === 'function' ? rebuildFn : async () => {
    const { buildSeedCatalog } = await import('../seeds/seedCatalogBuilder.js');
    return buildSeedCatalog(profile, { targetCount: 30 });
  };
  let rebuilt = fn();
  if (rebuilt && typeof rebuilt.then === 'function') rebuilt = await rebuilt;
  if (rebuilt && (rebuilt.categories || rebuilt.items)) {
    const merged = {
      profile: catalog?.profile || {},
      categories: rebuilt.categories || [],
      products: rebuilt.items || [],
      meta: { ...(catalog?.meta || {}), ...(rebuilt.meta || {}) },
    };
    if (catalog?.optionsSchema) merged.optionsSchema = catalog.optionsSchema;
    return { catalog: merged, corrected: true, reasons: validation.reasons };
  }

  return { catalog, corrected: false, reasons: validation.reasons };
}
