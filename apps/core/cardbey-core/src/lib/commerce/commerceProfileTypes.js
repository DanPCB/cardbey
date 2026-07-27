/**
 * Canonical business-commerce and catalog-item contracts.
 * @module commerce/commerceProfileTypes
 */

/** @typedef {'retail'|'service'|'hospitality'|'professional'|'appointment'|'rental'|'hybrid'} BusinessKind */

/** @typedef {'product'|'service'|'menu_item'|'appointment'|'rental_item'|'mixed'} CatalogKind */

/** @typedef {'checkout'|'booking'|'quote'|'enquiry'|'reservation'|'mixed'} TransactionMode */

/** @typedef {'fixed'|'starting_from'|'hourly'|'quote_required'|'free'|'mixed'} PricingMode */

/**
 * @typedef {object} BusinessCommerceProfile
 * @property {BusinessKind} businessKind
 * @property {CatalogKind} catalogKind
 * @property {TransactionMode} transactionMode
 * @property {PricingMode} pricingMode
 * @property {number} confidence
 * @property {string[]} evidence
 * @property {string} [currencyCode]
 * @property {string} [verticalSlug]
 */

/** @typedef {'product'|'service'|'menu_item'|'appointment'|'rental_item'} CatalogItemKind */

/** @typedef {'conversion_action'} CatalogRecordType */

/**
 * @typedef {'exact'|'strong'|'acceptable'|'category_fallback'|'placeholder'|'rejected'|'missing'} ImageSelectionStatus
 */

/**
 * @typedef {object} ImageSelectionEvidence
 * @property {string} provider
 * @property {string} [assetId]
 * @property {string} sourceQuery
 * @property {string} canonicalItemName
 * @property {string[]} matchedObjects
 * @property {string[]} matchedActions
 * @property {string[]} conflictingObjects
 * @property {number} metadataScore
 * @property {number} [visualScore]
 * @property {number} finalScore
 * @property {ImageSelectionStatus} status
 */

/**
 * @typedef {object} VisualRelevanceResult
 * @property {boolean} expectedObjectVisible
 * @property {boolean} expectedActionVisible
 * @property {boolean} professionalContextVisible
 * @property {boolean} conflictingObjectVisible
 * @property {string[]} detectedConcepts
 * @property {string} visualCategory
 * @property {number} confidence
 */

/**
 * @typedef {object} CanonicalService
 * @property {string} originalName
 * @property {string} canonicalName
 * @property {string} serviceCategory
 * @property {string[]} aliases
 * @property {string[]} removedSuffixes
 * @property {number} confidence
 */

/**
 * @typedef {object} CatalogItemBase
 * @property {string} [id]
 * @property {CatalogItemKind} itemKind
 * @property {string} name
 * @property {string} [description]
 * @property {string} [category]
 * @property {string} [categoryId]
 * @property {string} [imageUrl]
 * @property {ImageSelectionEvidence} [imageSelection]
 * @property {ImageSelectionStatus} [imageMatchStatus]
 * @property {string} [canonicalServiceTitle]
 * @property {boolean} [active]
 * @property {string} [currency]
 * @property {string} [currencyCode]
 */

/**
 * @typedef {CatalogItemBase & {
 *   itemKind: 'product',
 *   sku?: string,
 *   inventory?: number,
 *   purchaseEnabled?: boolean,
 *   price?: number,
 *   priceMode?: 'fixed',
 * }} ProductCatalogItem
 */

/**
 * @typedef {CatalogItemBase & {
 *   itemKind: 'service',
 *   serviceMode?: 'on_site'|'at_business'|'remote'|'mobile'|'mixed',
 *   bookingMode?: 'instant'|'request'|'quote_first'|'contact_only',
 *   priceMode?: PricingMode,
 *   price?: number,
 *   fromPrice?: number,
 *   priceUnit?: string,
 *   durationMinutes?: number,
 *   serviceArea?: string[],
 *   requiresAddress?: boolean,
 *   requiresAssessment?: boolean,
 *   urgencySupported?: boolean,
 *   recordType?: CatalogRecordType,
 *   transactionMode?: TransactionMode,
 *   bookingEnabled?: boolean,
 *   purchaseEnabled?: boolean,
 *   primaryAction?: string,
 *   executionAction?: string,
 *   pricingModel?: string,
 *   imageQueryHint?: string,
 *   priceProvenance?: 'owner'|'research'|'blueprint'|'inferred'|null,
 * }} ServiceCatalogItem
 */

/**
 * @typedef {CatalogItemBase & { itemKind: 'menu_item', price?: number, priceMode?: PricingMode }} MenuCatalogItem
 * @typedef {CatalogItemBase & { itemKind: 'appointment' }} AppointmentCatalogItem
 * @typedef {CatalogItemBase & { itemKind: 'rental_item' }} RentalCatalogItem
 */

/** @typedef {ProductCatalogItem|ServiceCatalogItem|MenuCatalogItem|AppointmentCatalogItem|RentalCatalogItem} CatalogItem */

/**
 * @typedef {object} CatalogCounts
 * @property {number} catalogItemCount
 * @property {number} serviceCount
 * @property {number} productCount
 * @property {number} menuItemCount
 * @property {number} appointmentCount
 * @property {number} rentalItemCount
 * @property {number} conversionActionCount
 */

export const BUSINESS_KINDS = ['retail', 'service', 'hospitality', 'professional', 'appointment', 'rental', 'hybrid'];
export const CATALOG_KINDS = ['product', 'service', 'menu_item', 'appointment', 'rental_item', 'mixed'];
export const TRANSACTION_MODES = ['checkout', 'booking', 'quote', 'enquiry', 'reservation', 'mixed'];
export const PRICING_MODES = ['fixed', 'starting_from', 'hourly', 'quote_required', 'free', 'mixed'];
export const CATALOG_ITEM_KINDS = ['product', 'service', 'menu_item', 'appointment', 'rental_item'];

export const CONVERSION_ACTION_NAMES = new Set([
  'request quote',
  'get a quote',
  'free inspection',
  'free quote',
  'contact us',
  'enquire',
  'inquiry',
]);

export const IMAGE_SELECTION_STATUSES = [
  'exact',
  'strong',
  'acceptable',
  'category_fallback',
  'placeholder',
  'rejected',
  'missing',
];
