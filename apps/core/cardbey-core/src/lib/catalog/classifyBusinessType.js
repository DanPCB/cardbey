/**
 * Canonical business type classifier for store creation / catalog generation.
 * Runs before catalog items, section titles, CTAs, and subcategories are generated.
 */

import { isServiceCatalogPlaceholderName } from './serviceCatalogPlaceholders.js';

export const BUSINESS_TYPES = [
  'product_retail',
  'service_fixed_booking',
  'service_quote_required',
  'food_menu',
  'hybrid',
];

const FOOD_RE =
  /\b(restaurant|cafe|café|coffee|bakery|baker|takeaway|take away|food truck|food|dining|kitchen|bar\b|bistro|eatery|pizza|sushi|noodle|catering|menu)\b/i;
const RETAIL_RE =
  /\b(retail|shop|store|boutique|clothing|apparel|fashion|wear|accessories|footwear|electronics|homewares?|homeware|merchandise|sell|selling|products?|market|gallery|florist|wholesale)\b/i;
const FIXED_BOOKING_RE =
  /\b(nails?|nail salon|manicure|pedicure|nail art|gel nails|acrylic nails|spa|massage|facial|waxing|lash|brow|haircut|hair cut|hair salon|barber|beauty salon|wellness|car wash|auto detailing|detailing|cleaning package|inspection fee|on-?site measurement)\b/i;
const QUOTE_REQUIRED_RE =
  /\b(handyman|handy[\s-]?man|handyperson|til(e|ing)|floor(ing)?|renovation|plumb(ing|er)?|electric(ian|al)?|paint(ing|er)?|construct(ion|or)?|signage|bathroom|kitchen splashback|splashback|waterproof(ing)?|contractor|builder|bespoke|custom work|landscap(e|ing)|roof(ing)?|extension|refurbish|gutter|pressure wash|window clean|furniture assembly|tv mount)\b/i;
const SPA_NAILS_SPECIFIC_RE = /\b(nails?|spa|salon|beauty|massage|facial)\b/i;
const TILING_SPECIFIC_RE = /\b(til(e|ing)|floor(ing)?|splashback|waterproof)\b/i;

/**
 * @param {string | null | undefined} value
 */
function norm(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {object} input
 */
export function buildBusinessTypeCorpus(input = {}) {
  const parts = [
    input.businessName,
    input.storeName,
    input.category,
    input.businessType,
    input.storeType,
    input.description,
    input.prompt,
    input.userPrompt,
    input.documentText,
    input.location,
    input.catalogLabel,
    ...(Array.isArray(input.detectedServices) ? input.detectedServices : []),
    ...(Array.isArray(input.detectedProducts) ? input.detectedProducts : []),
    ...(Array.isArray(input.items)
      ? input.items
          .filter((i) => !isServiceCatalogPlaceholderName(i?.name))
          .map((i) => [i?.name, i?.title, i?.category, i?.description].join(' '))
      : []),
  ];
  return parts.map(norm).filter(Boolean).join(' ');
}

/**
 * @param {string} corpus
 */
function scoreSignals(corpus) {
  const text = norm(corpus);
  return {
    food: FOOD_RE.test(text) ? 3 : 0,
    retail: RETAIL_RE.test(text) ? 2 : 0,
    fixedBooking: FIXED_BOOKING_RE.test(text) ? 3 : 0,
    quoteRequired: QUOTE_REQUIRED_RE.test(text) ? 3 : 0,
  };
}

/**
 * @param {import('./classifyBusinessType.js').BusinessTypeClassification} businessType
 * @param {string} corpus
 */
export function recommendedCatalogLabelForType(businessType, corpus = '') {
  const text = norm(corpus);
  switch (businessType) {
    case 'food_menu':
      return 'Menu';
    case 'product_retail':
      return 'Products';
    case 'service_quote_required':
      if (TILING_SPECIFIC_RE.test(text)) return 'Services & Quotes';
      return 'Services';
    case 'service_fixed_booking':
      if (SPA_NAILS_SPECIFIC_RE.test(text)) return 'Book Services';
      return 'Services';
    case 'hybrid':
      return 'Catalog';
    default:
      return 'Catalog';
  }
}

/**
 * @typedef {'product_retail' | 'service_fixed_booking' | 'service_quote_required' | 'food_menu' | 'hybrid'} CanonicalBusinessType
 */

/**
 * @typedef {object} BusinessTypeClassification
 * @property {CanonicalBusinessType} businessType
 * @property {number} confidence
 * @property {string} reasoning
 * @property {string} recommendedCatalogLabel
 * @property {string} defaultCTA
 * @property {string} defaultItemType
 * @property {string} defaultPricingMode
 * @property {string[]} suggestedSubcategories
 * @property {string} catalogMode
 * @property {string} generatedContentProfile
 * @property {string} primaryCTA
 */

/**
 * @param {object} input
 * @returns {BusinessTypeClassification}
 */
export function classifyBusinessType(input = {}) {
  const corpus = buildBusinessTypeCorpus(input);
  const signals = scoreSignals(corpus);
  const hasServiceItems = Array.isArray(input.items)
    ? input.items
        .filter((i) => !isServiceCatalogPlaceholderName(i?.name))
        .some((i) => {
        const t = norm(i?.itemType ?? i?.type ?? i?.kind);
        return t === 'service' || t === 'services';
      })
    : false;
  const hasProductItems = Array.isArray(input.items)
    ? input.items.some((i) => {
        const t = norm(i?.itemType ?? i?.type ?? i?.kind);
        return t === 'product' || t === 'products';
      })
    : false;

  let businessType = /** @type {CanonicalBusinessType} */ ('product_retail');
  let confidence = 0.55;
  let reasoning = 'Defaulted to product retail';

  const serviceDominant = signals.fixedBooking + signals.quoteRequired;
  const hybridSignals =
    (signals.retail > 0 && serviceDominant > 0) ||
    (hasProductItems && hasServiceItems) ||
    (signals.food > 0 && serviceDominant > 0);

  if (hybridSignals) {
    businessType = 'hybrid';
    confidence = 0.72;
    reasoning = 'Mixed product and service signals detected';
  } else if (signals.food >= signals.retail && signals.food >= serviceDominant && signals.food > 0) {
    businessType = 'food_menu';
    confidence = 0.88;
    reasoning = 'Food/restaurant/cafe keywords detected';
  } else if (signals.quoteRequired >= signals.fixedBooking && signals.quoteRequired > 0) {
    businessType = 'service_quote_required';
    confidence = 0.86;
    reasoning = 'Trade/custom-project keywords detected';
  } else if (signals.fixedBooking > 0) {
    businessType = 'service_fixed_booking';
    confidence = 0.86;
    reasoning = 'Bookable appointment service keywords detected';
  } else if (signals.retail > 0) {
    businessType = 'product_retail';
    confidence = 0.8;
    reasoning = 'Retail/product keywords detected';
  } else if (hasServiceItems && !hasProductItems) {
    if (signals.food > 0) {
      businessType = 'food_menu';
      confidence = 0.82;
      reasoning = 'Food signals override leaked service placeholder items';
    } else if (signals.retail > 0) {
      businessType = 'product_retail';
      confidence = 0.82;
      reasoning = 'Retail signals override leaked service placeholder items';
    } else {
      businessType = signals.quoteRequired > 0 ? 'service_quote_required' : 'service_fixed_booking';
      confidence = 0.7;
      reasoning = 'Catalog items are predominantly services';
    }
  }

  const recommendedCatalogLabel = recommendedCatalogLabelForType(businessType, corpus);
  const profile = catalogProfileDefaults(businessType, corpus);

  return {
    businessType,
    confidence,
    reasoning,
    recommendedCatalogLabel,
    defaultCTA: profile.primaryCTA,
    defaultItemType: profile.defaultItemType,
    defaultPricingMode: profile.defaultPricingMode,
    suggestedSubcategories: profile.suggestedSubcategories,
    catalogMode: profile.catalogMode,
    generatedContentProfile: profile.generatedContentProfile,
    primaryCTA: profile.primaryCTA,
  };
}

/**
 * @param {CanonicalBusinessType} businessType
 * @param {string} corpus
 */
export function catalogProfileDefaults(businessType, corpus = '') {
  const text = norm(corpus);
  switch (businessType) {
    case 'food_menu':
      return {
        catalogMode: 'menu',
        generatedContentProfile: 'food_menu',
        primaryCTA: 'Order',
        defaultItemType: 'menu_item',
        defaultPricingMode: 'fixed',
        suggestedSubcategories: ['All', 'Entrees', 'Mains', 'Drinks', 'Desserts', 'Specials', 'Combos'],
      };
    case 'service_quote_required':
      return {
        catalogMode: 'quote_services',
        generatedContentProfile: TILING_SPECIFIC_RE.test(text) ? 'project_services_tiling' : 'project_services',
        primaryCTA: 'Request quote',
        defaultItemType: 'service',
        defaultPricingMode: 'from_price',
        suggestedSubcategories: TILING_SPECIFIC_RE.test(text)
          ? ['All', 'Bathroom Tiling', 'Floor Tiling', 'Wall Tiling', 'Kitchen Splashback', 'Waterproofing', 'Repairs', 'Outdoor', 'Commercial']
          : ['All', 'Popular Services', 'Project Work', 'Repairs', 'Inspections', 'Commercial'],
      };
    case 'service_fixed_booking':
      return {
        catalogMode: 'services',
        generatedContentProfile: SPA_NAILS_SPECIFIC_RE.test(text) ? 'appointment_services_beauty' : 'appointment_services',
        primaryCTA: 'Book',
        defaultItemType: 'service',
        defaultPricingMode: 'fixed',
        suggestedSubcategories: SPA_NAILS_SPECIFIC_RE.test(text)
          ? ['All', 'Manicure', 'Pedicure', 'Nail Art', 'Spa Packages', 'Facial', 'Waxing', 'Massage', 'Bridal / Events']
          : ['All', 'Popular Services', 'Packages', 'Add-ons', 'Consultations'],
      };
    case 'hybrid':
      return {
        catalogMode: 'mixed',
        generatedContentProfile: 'hybrid_catalog',
        primaryCTA: 'Shop',
        defaultItemType: 'product',
        defaultPricingMode: 'fixed',
        suggestedSubcategories: ['All', 'Services', 'Products', 'Packages', 'Specials'],
      };
    case 'product_retail':
    default:
      return {
        catalogMode: 'products',
        generatedContentProfile: 'product_retail',
        primaryCTA: 'Add to cart',
        defaultItemType: 'product',
        defaultPricingMode: 'fixed',
        suggestedSubcategories: ['All', 'Featured', 'New Arrivals', 'Best Sellers', 'Sale'],
      };
  }
}

/** Schema defaults that should not block inferred service/food labels. */
export const GENERATED_CATALOG_LABEL_DEFAULTS = new Set([
  'products',
  'product',
  'shop',
  'shop now',
  'our products',
]);

/**
 * @param {string | null | undefined} storedLabel
 * @param {string} inferredLabel
 */
export function shouldOverrideStoredCatalogLabel(storedLabel, inferredLabel) {
  const stored = norm(storedLabel);
  const inferred = norm(inferredLabel);
  if (!stored) return true;
  if (stored === inferred) return false;
  if (GENERATED_CATALOG_LABEL_DEFAULTS.has(stored)) return true;
  return false;
}
