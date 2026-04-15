/**
 * Vertical validator: detect catalog/vertical mismatch and auto-correct by rebuilding.
 * Per verticalGroup blacklist; optional rebuild-from-seed using same profile (stricter).
 */

export const COFFEE_KEYWORDS = [
  'espresso', 'latte', 'cappuccino', 'coffee', 'mocha', 'chai', 'tea', 'matcha', 'flat white',
  'croissant', 'muffin', 'cold brew', 'iced coffee',
];

const COFFEE_REGEX = new RegExp(COFFEE_KEYWORDS.join('|'), 'i');

/** For non-food verticals: product name/description must not contain these. */
const FORBIDDEN_NON_FOOD = COFFEE_REGEX;

/** For food verticals: forbid fashion/beauty/service-style keywords in items. */
const FASHION_BEAUTY_SERVICE = /\b(manicure|pedicure|nail art|gel|acrylic|haircut|blowdry|suit|dress|blouse|plumbing|electrician|quote required)\b/i;

/** For entertainment (e.g. game_centre): forbid coffee/food and generic services (plumbing, cleaning, callout). */
const ENTERTAINMENT_FORBIDDEN = /\b(espresso|latte|cappuccino|coffee|mocha|plumbing|plumber|cleaning|cleaner|electrician|quote required|call-out|callout)\b/i;

/** Kids audience (e.g. fashion.kids): forbid adult-focused terms. */
const KIDS_FORBIDDEN = /\b(men's|mens|women's|womens|heels|lingerie|formal suit|dress shirt|leather boots|adult)\b/i;

/** Per verticalGroup blacklist regex for mismatch detection. */
export const BLACKLIST_BY_GROUP = {
  food: FASHION_BEAUTY_SERVICE,
  entertainment: ENTERTAINMENT_FORBIDDEN,
  fashion: FORBIDDEN_NON_FOOD,
  beauty: FORBIDDEN_NON_FOOD,
  retail: FORBIDDEN_NON_FOOD,
  services: FORBIDDEN_NON_FOOD,
  health: FORBIDDEN_NON_FOOD,
  home: FORBIDDEN_NON_FOOD,
  auto: FORBIDDEN_NON_FOOD,
  education: FORBIDDEN_NON_FOOD,
  events: FORBIDDEN_NON_FOOD,
};

/**
 * Count products whose name or description match the given regex.
 * @param {{ name?: string, description?: string }[]} products
 * @param {RegExp} re
 * @returns {number}
 */
function countHits(products, re) {
  if (!Array.isArray(products)) return 0;
  return products.filter((p) => {
    const text = `${p.name || ''} ${p.description || ''}`;
    return re.test(text);
  }).length;
}

/**
 * @param {string} verticalSlug - e.g. food.seafood, beauty.nails
 * @param {{ products: array, profile?: object, meta?: { catalogSource?: string, classificationProfile?: object, draftId?: string, audience?: string } }} catalog
 * @param {(params: object) => Promise<object>} buildFromTemplate
 * @param {(params: object) => Promise<object>} [buildFromSeed] - optional; when catalog was built from seed, rebuild using profile (stricter)
 * @returns {Promise<{ catalog: object, warnings: string[], corrected: boolean }>}
 */
export async function validateAndCorrect({ verticalSlug, catalog, buildFromTemplate, buildFromSeed }) {
  const warnings = [];
  const slug = (verticalSlug || '').toString().toLowerCase().trim();
  const group = slug.split('.')[0] || '';
  const products = catalog?.products || [];

  if (products.length === 0) {
    return { catalog, warnings, corrected: false };
  }

  let mismatch = false;

  const re = BLACKLIST_BY_GROUP[group] || (group !== 'food' ? FORBIDDEN_NON_FOOD : FASHION_BEAUTY_SERVICE);
  let hits = countHits(products, re);
  if (group === 'fashion' && (catalog?.meta?.audience === 'kids' || slug === 'fashion.kids')) {
    const kidsHits = countHits(products, KIDS_FORBIDDEN);
    if (kidsHits > 0) hits += kidsHits;
  }
  const pct = products.length ? (hits / products.length) * 100 : 0;
  if (hits >= 2 || pct >= 10) {
    mismatch = true;
    warnings.push(`Vertical "${verticalSlug}" had ${hits} blacklist keyword hits (${pct.toFixed(0)}%)`);
  }

  if (!mismatch) {
    return { catalog, warnings, corrected: false };
  }

  const catalogSource = catalog?.meta?.catalogSource;
  const profile = catalog?.meta?.classificationProfile;

  if ((catalogSource === 'seed' || catalogSource === 'template') && profile && typeof buildFromSeed === 'function') {
    const { buildSeedCatalog } = await import('../seeds/smeSeedBuilder.js');
    const { items } = await buildSeedCatalog(profile, 30);
    const params = {
      draftId: catalog.meta?.draftId || 'validator',
      seedItems: items,
      verticalSlug,
      businessName: catalog.profile?.name,
      businessType: catalog.profile?.type,
      classificationProfile: profile,
      audience: catalog.meta?.audience,
    };
    const correctedCatalog = await buildFromSeed(params);
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[verticalValidator] corrected via seed rebuild (stricter)', { verticalSlug, itemCount: items?.length });
    }
    return { catalog: correctedCatalog, warnings, corrected: true };
  }

  const { selectTemplateId } = await import('../../draftStore/selectTemplateId.js');
  const templateId = selectTemplateId(verticalSlug);
  const params = {
    draftId: catalog.meta?.draftId || 'validator',
    templateId,
    businessName: catalog.profile?.name,
    businessType: catalog.profile?.type,
    verticalSlug,
  };
  const correctedCatalog = await buildFromTemplate(params);
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[verticalValidator] corrected', { verticalSlug, templateId, hits: warnings[0] });
  } else {
    console.warn('[verticalValidator] corrected', JSON.stringify({ verticalSlug, templateId }));
  }
  return { catalog: correctedCatalog, warnings, corrected: true };
}
