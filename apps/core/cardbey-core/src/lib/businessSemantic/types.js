/**
 * Business Semantic Layer (BSL) — canonical types and constants.
 * @module businessSemantic
 */

export const BSL_VERSION = '1.0.0';

export const BUSINESS_TYPES = [
  'product_retail',
  'service_fixed_booking',
  'service_quote_required',
  'food_menu',
  'hybrid',
];

export const COMMERCE_TYPES = ['product', 'service', 'food', 'hybrid'];

export const EXECUTION_MODELS = ['browse_buy', 'book', 'quote', 'reservation', 'mixed'];

export const CATALOG_MODES = ['products', 'services', 'menu', 'catalog'];

export const PRICING_MODELS = ['fixed', 'from_price', 'hourly', 'custom', 'subscription'];

export const FULFILLMENT_MODELS = ['pickup', 'delivery', 'onsite', 'appointment', 'remote', 'digital'];

export const CUSTOMER_JOURNEYS = ['browse_buy', 'browse_book', 'browse_quote', 'reservation', 'mixed'];

export const CAPABILITY_KEYS = [
  'cart',
  'checkout',
  'inventory',
  'shipping',
  'returns',
  'booking',
  'calendar',
  'appointments',
  'memberships',
  'quotation',
  'inspection_booking',
  'consultation',
  'file_intake',
  'projects',
  'portfolio',
  'gallery',
  'reviews',
  'loyalty',
  'menu',
  'ordering',
  'delivery',
  'table_booking',
  'kitchen',
  'reservation',
];

/**
 * @typedef {typeof BUSINESS_TYPES[number]} CanonicalBusinessType
 * @typedef {typeof COMMERCE_TYPES[number]} CommerceType
 * @typedef {typeof EXECUTION_MODELS[number]} ExecutionModel
 * @typedef {typeof CATALOG_MODES[number]} CatalogMode
 * @typedef {typeof PRICING_MODELS[number]} PricingModel
 * @typedef {typeof FULFILLMENT_MODELS[number]} FulfillmentModel
 * @typedef {typeof CUSTOMER_JOURNEYS[number]} CustomerJourney
 */

/**
 * @typedef {Record<string, boolean>} BusinessCapabilities
 */

/**
 * @typedef {object} BusinessPresentation
 * @property {string} catalogLabel
 * @property {string[]} sectionTitles
 * @property {string} primaryCTA
 * @property {string} [secondaryCTA]
 * @property {string} [buttonStyle]
 * @property {string} [defaultBadge]
 * @property {string} [navigationStyle]
 */

/**
 * @typedef {object} BusinessRuntimeProfile
 * @property {boolean} bookingEnabled
 * @property {boolean} quotationEnabled
 * @property {boolean} orderingEnabled
 * @property {boolean} inventoryEnabled
 * @property {boolean} projectsEnabled
 * @property {boolean} appointmentsEnabled
 * @property {boolean} calendarEnabled
 * @property {boolean} membershipsEnabled
 * @property {boolean} deliveryEnabled
 */

/**
 * @typedef {object} BusinessGenerationProfile
 * @property {string[]} defaultSections
 * @property {string} recommendedCatalog
 * @property {string[]} defaultCategories
 * @property {string[]} suggestedServices
 * @property {Record<string, string>} defaultCTAs
 * @property {string} heroLayout
 * @property {string} [galleryLayout]
 * @property {string} [reviewStyle]
 */

/**
 * @typedef {object} BusinessProfile
 * @property {string} [storeId]
 * @property {string} version
 * @property {CanonicalBusinessType} businessType
 * @property {string} industry
 * @property {string} [subIndustry]
 * @property {CommerceType} commerceType
 * @property {ExecutionModel} executionModel
 * @property {CatalogMode} catalogMode
 * @property {PricingModel} pricingModel
 * @property {FulfillmentModel} fulfillmentModel
 * @property {CustomerJourney} customerJourney
 * @property {string} primaryIntent
 * @property {BusinessCapabilities} capabilities
 * @property {BusinessPresentation} presentation
 * @property {BusinessRuntimeProfile} runtimeProfile
 * @property {BusinessGenerationProfile} generationProfile
 * @property {object} [metadata]
 */

/**
 * @typedef {object} BusinessSemanticInput
 * @property {string} [storeId]
 * @property {string} [businessName]
 * @property {string} [storeName]
 * @property {string} [category]
 * @property {string} [businessType]
 * @property {string} [storeType]
 * @property {string} [description]
 * @property {string} [prompt]
 * @property {string} [userPrompt]
 * @property {string} [documentText]
 * @property {string} [ocrRawText]
 * @property {string} [cardText]
 * @property {string} [website]
 * @property {string} [location]
 * @property {string[]} [detectedServices]
 * @property {string[]} [detectedProducts]
 * @property {object[]} [items]
 * @property {object[]} [detectedEntities]
 */

/**
 * @typedef {object} BusinessSemanticResult
 * @property {BusinessProfile} profile
 * @property {number} confidence
 * @property {string} reasoning
 * @property {string[]} [recommendations]
 */
