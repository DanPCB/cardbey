/**
 * Customer journey resolution from business type and execution model.
 */

import { EXECUTION_MODELS, CUSTOMER_JOURNEYS } from './types.js';

/** @param {string} businessType */
export function resolveExecutionModel(businessType) {
  switch (businessType) {
    case 'product_retail':
      return 'browse_buy';
    case 'service_fixed_booking':
      return 'book';
    case 'service_quote_required':
      return 'quote';
    case 'food_menu':
      return 'reservation';
    case 'hybrid':
      return 'mixed';
    default:
      return 'browse_buy';
  }
}

/** @param {string} businessType @param {string} [executionModel] */
export function resolveCustomerJourney(businessType, executionModel) {
  const model = executionModel ?? resolveExecutionModel(businessType);
  if (CUSTOMER_JOURNEYS.includes(model)) return model;
  switch (businessType) {
    case 'product_retail':
      return 'browse_buy';
    case 'service_fixed_booking':
      return 'browse_book';
    case 'service_quote_required':
      return 'browse_quote';
    case 'food_menu':
      return 'reservation';
    case 'hybrid':
      return 'mixed';
    default:
      return 'browse_buy';
  }
}

/** @param {string} businessType */
export function resolvePrimaryIntent(businessType) {
  switch (businessType) {
    case 'product_retail':
      return 'purchase_products';
    case 'service_fixed_booking':
      return 'book_appointment';
    case 'service_quote_required':
      return 'request_project_quote';
    case 'food_menu':
      return 'order_food';
    case 'hybrid':
      return 'browse_mixed_commerce';
    default:
      return 'discover_business';
  }
}

/** @param {string} businessType */
export function resolveCommerceType(businessType) {
  switch (businessType) {
    case 'product_retail':
      return 'product';
    case 'service_fixed_booking':
    case 'service_quote_required':
      return 'service';
    case 'food_menu':
      return 'food';
    case 'hybrid':
      return 'hybrid';
    default:
      return 'product';
  }
}

/** @param {string} businessType */
export function resolveCatalogMode(businessType) {
  switch (businessType) {
    case 'product_retail':
      return 'products';
    case 'service_fixed_booking':
    case 'service_quote_required':
      return 'services';
    case 'food_menu':
      return 'menu';
    case 'hybrid':
      return 'catalog';
    default:
      return 'products';
  }
}

/** @param {string} businessType */
export function resolvePricingModel(businessType) {
  switch (businessType) {
    case 'service_quote_required':
      return 'from_price';
    case 'service_fixed_booking':
      return 'fixed';
    case 'food_menu':
      return 'fixed';
    case 'hybrid':
      return 'fixed';
    default:
      return 'fixed';
  }
}

/** @param {string} businessType @param {string} corpus */
export function resolveFulfillmentModel(businessType, corpus = '') {
  const text = String(corpus ?? '').toLowerCase();
  switch (businessType) {
    case 'product_retail':
      return /\b(delivery|ship|shipping)\b/i.test(text) ? 'delivery' : 'pickup';
    case 'service_fixed_booking':
      return 'appointment';
    case 'service_quote_required':
      return 'onsite';
    case 'food_menu':
      if (/\b(delivery|takeaway)\b/i.test(text)) return 'delivery';
      if (/\b(dine in|reservation|table)\b/i.test(text)) return 'appointment';
      return 'pickup';
    case 'hybrid':
      return 'pickup';
    default:
      return 'pickup';
  }
}
