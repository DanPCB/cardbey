/**
 * Canonical business vertical + commerce mode classifier (SSOT).
 * Used by ingestion, draft generation, publish, public API, and feed projection.
 */

/** @typedef {'food' | 'service' | 'retail' | 'experience' | 'health' | 'beauty' | 'unknown'} BusinessVertical */
/** @typedef {'menu' | 'services' | 'products' | 'bookings' | 'enquiry' | 'mixed'} CommerceVerticalMode */

export const BUSINESS_VERTICALS = ['food', 'service', 'retail', 'experience', 'health', 'beauty', 'unknown'];
export const COMMERCE_VERTICAL_MODES = ['menu', 'services', 'products', 'bookings', 'enquiry', 'mixed'];

const FOOD_RE =
  /\b(bakery|baker|croissanterie|espresso|coffee|cafe|café|restaurant|bar\b|bistro|takeaway|take away|food|drink|dining|kitchen|eatery|pizzeria|handroll|sushi|vietnamese|banh mi|noodle|dessert|catering|grocer|menu)\b/i;
const BEAUTY_RE =
  /\b(hair|salon|nails?|spa|massage|beauty|yoga|pilates|wellness|lash|wax|barber|tattoo)\b/i;
const HEALTH_RE = /\b(vet|veterinar|clinic|dental|dentist|physio|medical|doctor|pharmacy|hospital)\b/i;
const RETAIL_RE =
  /\b(fashion|clothing|apparel|boutique|retail|shop|store|products?|merchandise|market|gallery|florist|readings)\b/i;
const EXPERIENCE_RE =
  /\b(travel|tour|golf tour|itinerary|tourism|adventure|experience|agency)\b/i;
const SERVICE_RE =
  /\b(service|services|booking|appointment|consulting|coaching|cleaning|repair|class|classes|lesson|workshop|studio|fitness|gym|event|venue)\b/i;

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
 * @param {{ category?: string | null, businessType?: string | null, storeType?: string | null, businessName?: string | null, storeName?: string | null }} input
 */
export function buildClassificationCorpus(input = {}) {
  return [
    input.category,
    input.businessType,
    input.storeType,
    input.businessName,
    input.storeName,
  ]
    .map(norm)
    .filter(Boolean)
    .join(' ');
}

/**
 * @param {string} corpus
 * @returns {BusinessVertical}
 */
export function inferBusinessVerticalFromCorpus(corpus) {
  const text = norm(corpus);
  if (!text) return 'unknown';
  if (FOOD_RE.test(text)) return 'food';
  if (BEAUTY_RE.test(text)) return 'beauty';
  if (HEALTH_RE.test(text)) return 'health';
  if (RETAIL_RE.test(text)) return 'retail';
  if (EXPERIENCE_RE.test(text)) return 'experience';
  if (SERVICE_RE.test(text)) return 'service';
  return 'unknown';
}

/**
 * @param {BusinessVertical} vertical
 * @param {string} corpus
 * @returns {CommerceVerticalMode}
 */
export function commerceModeForVertical(vertical, corpus = '') {
  switch (vertical) {
    case 'food':
      return 'menu';
    case 'retail':
      return 'products';
    case 'beauty':
    case 'health':
      return 'bookings';
    case 'experience':
      if (/\b(travel|tour|golf|itinerary|tourism|agency|escape|package)\b/i.test(corpus)) {
        return 'bookings';
      }
      return /\b(book|booking|appointment|reserve)\b/i.test(corpus) ? 'bookings' : 'enquiry';
    case 'service':
      return /\b(book|booking|appointment)\b/i.test(corpus) ? 'bookings' : 'services';
    default:
      return 'enquiry';
  }
}

/**
 * @param {CommerceVerticalMode} commerceMode
 */
export function legacyCommerceModeFromVertical(commerceMode) {
  if (commerceMode === 'bookings' || commerceMode === 'services') return 'booking';
  if (commerceMode === 'enquiry') return 'inquiry';
  return 'order';
}

/**
 * @param {CommerceVerticalMode} commerceMode
 * @param {BusinessVertical} businessVertical
 */
export function defaultCtaForCommerceMode(commerceMode, businessVertical = 'unknown') {
  switch (commerceMode) {
    case 'menu':
      return 'Order now';
    case 'products':
      return 'Shop now';
    case 'bookings':
    case 'services':
      return 'Book now';
    case 'enquiry':
      return businessVertical === 'experience' ? 'Enquire now' : 'Contact business';
    default:
      return 'Contact business';
  }
}

/**
 * @param {CommerceVerticalMode} commerceMode
 */
export function defaultCatalogLabelForCommerceMode(commerceMode) {
  switch (commerceMode) {
    case 'menu':
      return 'Menu';
    case 'products':
      return 'Products';
    case 'bookings':
    case 'services':
      return 'Services';
    case 'enquiry':
      return 'Services';
    default:
      return 'Products';
  }
}

/**
 * @param {BusinessVertical} vertical
 * @returns {'food' | 'products' | 'services' | 'others'}
 */
export function feedCategoryForVertical(vertical) {
  switch (vertical) {
    case 'food':
      return 'food';
    case 'retail':
      return 'products';
    case 'beauty':
    case 'health':
    case 'service':
    case 'experience':
      return 'services';
    default:
      return 'others';
  }
}

/**
 * @param {{ category?: string | null, businessType?: string | null, storeType?: string | null, businessName?: string | null, storeName?: string | null, commerceMode?: string | null, businessVertical?: string | null }} input
 */
export function classifyBusinessVertical(input = {}) {
  const corpus = buildClassificationCorpus(input);
  const businessVertical = /** @type {BusinessVertical} */ (
    input.businessVertical && BUSINESS_VERTICALS.includes(input.businessVertical)
      ? input.businessVertical
      : inferBusinessVerticalFromCorpus(corpus)
  );
  const commerceMode = /** @type {CommerceVerticalMode} */ (
    input.commerceMode && COMMERCE_VERTICAL_MODES.includes(input.commerceMode)
      ? input.commerceMode
      : commerceModeForVertical(businessVertical, corpus)
  );
  const legacyCommerceMode = legacyCommerceModeFromVertical(commerceMode);
  const transactionMode = legacyCommerceMode === 'booking' ? 'booking' : 'order';

  return {
    businessVertical,
    commerceMode,
    legacyCommerceMode,
    transactionMode,
    feedCategory: feedCategoryForVertical(businessVertical),
    ctaLabel: defaultCtaForCommerceMode(commerceMode, businessVertical),
    catalogLabel: defaultCatalogLabelForCommerceMode(commerceMode),
    ctaAction:
      commerceMode === 'bookings' || commerceMode === 'services'
        ? 'booking'
        : commerceMode === 'enquiry'
          ? 'inquiry'
          : 'order',
    storeType: input.businessType ?? input.storeType ?? input.category ?? businessVertical,
  };
}
