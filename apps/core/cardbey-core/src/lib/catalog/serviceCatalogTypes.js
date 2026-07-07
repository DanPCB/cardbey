/**
 * Service Catalog types and constants.
 * Runtime Product rows map to CatalogItem via catalogItemClassification + serviceCatalogNormalizer.
 */

/** @typedef {'product' | 'service'} CatalogItemType */

/** @typedef {'fixed_booking' | 'quote_required'} ServiceMode */

/** @typedef {'fixed' | 'from_price' | 'hourly' | 'custom'} PricingModel */

/** @typedef {'service' | 'hour' | 'm2' | 'day' | 'project'} PriceUnit */

/** @typedef {'add_to_cart' | 'book' | 'request_quote' | 'contact'} ExecutionAction */

/**
 * @typedef {object} ServiceCatalogFields
 * @property {ServiceMode} [serviceMode]
 * @property {PricingModel} [pricingModel]
 * @property {number} [fromPrice]
 * @property {PriceUnit} [priceUnit]
 * @property {number} [durationMinutes]
 * @property {string} [estimateDurationLabel]
 * @property {ExecutionAction} [executionAction]
 */

export const SERVICE_MODES = ['fixed_booking', 'quote_required'];
export const PRICING_MODELS = ['fixed', 'from_price', 'hourly', 'custom'];
export const PRICE_UNITS = ['service', 'hour', 'm2', 'day', 'project'];
export const EXECUTION_ACTIONS = ['add_to_cart', 'book', 'request_quote', 'contact'];

export const QUOTE_REQUEST_STATUSES = [
  'new',
  'reviewing',
  'quoted',
  'accepted',
  'declined',
  'completed',
];
