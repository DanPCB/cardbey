/**
 * Detect service-catalog scaffold names leaked into food/retail/fashion stores.
 * Names like "Business Package", "Call-out Fee", and "Custom Quote" come from
 * services_generic templates and seed builders — not from food or product menus.
 */

const SERVICE_CATALOG_PLACEHOLDER_RE =
  /\b(business package|call-?out fee|custom quote|consultation|starter package|essential package|complete package|value package|core service|standard service|premium service|basic service|extended service|express service|full service|scheduled visit|emergency call-?out|support package|standard visit|site visit|follow-?up|maintenance|inspection|report|priority service|one-?off service|recurring service|add-?on service|package deal)\b/i;

const VARIATION_SUFFIX_RE = /\s*(\(variation\)|- option \d+|- style [a-z]|- alt|- second)$/i;

/**
 * @param {string | null | undefined} name
 */
export function normalizeServicePlaceholderName(name) {
  return String(name ?? '')
    .trim()
    .replace(VARIATION_SUFFIX_RE, '')
    .trim();
}

/**
 * @param {string | null | undefined} name
 */
export function isServiceCatalogPlaceholderName(name) {
  const base = normalizeServicePlaceholderName(name);
  if (!base) return false;
  return SERVICE_CATALOG_PLACEHOLDER_RE.test(base);
}

/**
 * @param {object[]} products
 */
export function countServiceCatalogPlaceholderHits(products) {
  if (!Array.isArray(products)) return 0;
  return products.filter((p) => isServiceCatalogPlaceholderName(p?.name)).length;
}

/**
 * @param {object} profile
 */
export function isNonServiceCatalogVertical(profile = {}) {
  const group = String(profile.verticalGroup ?? '').toLowerCase();
  const slug = String(profile.verticalSlug ?? '').toLowerCase();
  const blob = [
    profile.businessType,
    profile.storeType,
    profile.category,
    profile.businessName,
    profile.storeName,
    profile.catalogLabel,
  ]
    .map((v) => String(v ?? '').toLowerCase())
    .filter(Boolean)
    .join(' ');

  if (group === 'food' || group === 'retail' || group === 'fashion') return true;
  if (slug.startsWith('food.') || slug.startsWith('fashion.') || slug.startsWith('retail.')) return true;
  return /\b(restaurant|cafe|coffee|bakery|food|menu|dining|kitchen|bistro|eatery|pizza|fashion|retail|clothing|apparel|boutique|wear|shop|store)\b/.test(
    blob,
  );
}

/**
 * @param {object[]} products
 * @param {object} profile
 */
export function shouldRepairServiceCatalogLeak(products, profile = {}) {
  if (!Array.isArray(products) || products.length < 2) return false;
  if (!isNonServiceCatalogVertical(profile)) return false;
  const hits = countServiceCatalogPlaceholderHits(products);
  return hits >= 2 && hits / products.length >= 0.25;
}

/**
 * Replace leaked service placeholder names with vertical-appropriate seed names.
 * Preserves ids, images, prices, and category assignments.
 *
 * @param {object[]} products
 * @param {object} profile
 * @param {() => { categories?: object[], items?: object[] }} buildSeed
 */
export function repairServiceCatalogPlaceholderProducts(products, profile = {}, buildSeed) {
  if (!shouldRepairServiceCatalogLeak(products, profile)) {
    return { products, repaired: false, repairedCount: 0 };
  }
  const seed = typeof buildSeed === 'function' ? buildSeed() : null;
  const seedItems = Array.isArray(seed?.items) ? seed.items : [];
  if (seedItems.length === 0) {
    return { products, repaired: false, repairedCount: 0 };
  }

  let seedIdx = 0;
  let repairedCount = 0;
  const repaired = products.map((product) => {
    if (!product || typeof product !== 'object' || !isServiceCatalogPlaceholderName(product.name)) {
      return product;
    }
    const replacement = seedItems[seedIdx % seedItems.length];
    seedIdx += 1;
    repairedCount += 1;
    const next = {
      ...product,
      name: replacement?.name || product.name,
      description: replacement?.description ?? product.description ?? null,
      serviceMode: undefined,
      pricingModel: undefined,
      executionAction: undefined,
      primaryAction: undefined,
      bookingEnabled: undefined,
      purchaseEnabled: undefined,
      serviceCatalog: undefined,
      itemType: undefined,
      type: undefined,
      kind: undefined,
    };
    if (replacement?.categoryId && !product.categoryId) {
      next.categoryId = replacement.categoryId;
    }
    return next;
  });

  return {
    products: repaired,
    categories: seed?.categories,
    repaired: repairedCount > 0,
    repairedCount,
  };
}
