// AUDIT: generate_tags at store/generate_tags.js — store-level LLM tags; this is per-product SEO tags
// DANH: skill-round4-tags
/**
 * generate_seo_tags — product and store tag suggestions (no DB write).
 * Side effect: none — pure generation.
 */

const MAX_PRODUCTS = 10;
const TAGS_PER_PRODUCT = 5;

/**
 * @param {string} name
 * @param {string} [category]
 * @returns {string[]}
 */
export function tagsForProduct(name, category) {
  const n = String(name ?? '').trim().toLowerCase();
  const c = String(category ?? 'retail').trim().toLowerCase();
  const words = n.split(/\s+/).filter((w) => w.length > 2).slice(0, 3);
  const tags = [
    ...words,
    c,
    `${c} ${words[0] ?? 'product'}`.trim(),
    'local',
    'shop',
  ];
  return [...new Set(tags.map((t) => t.replace(/[^a-z0-9\s-]/gi, '').trim()).filter(Boolean))].slice(
    0,
    TAGS_PER_PRODUCT,
  );
}

/**
 * @param {string} [category]
 * @param {string} [storeSlug]
 * @returns {string[]}
 */
export function storeLevelTags(category, storeSlug) {
  const c = String(category ?? 'store').trim().toLowerCase();
  const slug = String(storeSlug ?? '').trim().toLowerCase();
  return [
    c,
    `${c} store`,
    'local business',
    slug || 'my-store',
    `${c} near me`,
  ].slice(0, 5);
}

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  // @pure-transform: deterministic tag generation; no DB/API side effects by design.
  const products = Array.isArray(input?.products) ? input.products.slice(0, MAX_PRODUCTS) : [];
  const businessCategory =
    typeof input?.businessCategory === 'string' ? input.businessCategory : 'retail';
  const storeSlug = typeof input?.storeSlug === 'string' ? input.storeSlug : '';

  const productTags = products.map((p) => ({
    id: p?.id ?? null,
    name: p?.name ?? '',
    tags: tagsForProduct(p?.name, businessCategory),
  }));

  return {
    status: 'ok',
    output: {
      productTags,
      storeTags: storeLevelTags(businessCategory, storeSlug),
    },
  };
}

export default execute;
