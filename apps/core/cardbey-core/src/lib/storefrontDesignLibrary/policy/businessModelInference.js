/**
 * Infer design-library business model from classification + commerce evidence.
 * Phase 3 — advisory metadata only (not storefront authority).
 */

import { isBusinessModel } from '../contracts/businessModel.js';

export const BUSINESS_MODEL_POLICY_VERSION = 1;

/**
 * @typedef {{
 *   businessModel: string,
 *   confidence: number,
 *   reasons: string[],
 *   policyVersion: number,
 * }} BusinessModelInference
 */

/**
 * @param {import('./commerceEvidence.js').CommerceEvidenceBundle} evidence
 * @returns {BusinessModelInference}
 */
export function inferBusinessModel(evidence) {
  const reasons = [];
  let businessModel = 'mixed';
  let confidence = 0.4;

  const {
    hasBookingProvider,
    hasBookingUrl,
    hasPricedPurchasableProduct,
    hasQuoteSignal,
    hasMenuRoles,
    hasProductRoles,
    hasServiceRoles,
    hasProjectRoles,
    hasDeliveryOrder,
    hasReservationSignal,
    serviceCategoryCount,
    serviceCount,
    productCount,
    menuItemCount,
    legacyBusinessType,
  } = evidence;

  const legacy = String(legacyBusinessType ?? '').toLowerCase();

  // Restaurant / food first when menu roles or food type + order signals
  if (
    hasMenuRoles ||
    legacy.includes('food') ||
    legacy.includes('restaurant') ||
    (hasDeliveryOrder && !hasPricedPurchasableProduct && hasServiceRoles === false)
  ) {
    businessModel = 'restaurant';
    confidence = hasMenuRoles || menuItemCount > 0 ? 0.9 : 0.75;
    reasons.push(hasMenuRoles ? 'menu_roles' : 'food_vertical_signal');
    if (hasDeliveryOrder) reasons.push('delivery_ordering_evidence');
    if (hasReservationSignal) reasons.push('reservation_evidence');
    return freeze(businessModel, confidence, reasons);
  }

  // Retail when purchasable products dominate
  if (hasPricedPurchasableProduct || (hasProductRoles && productCount >= serviceCount + serviceCategoryCount)) {
    businessModel = 'retail';
    confidence = hasPricedPurchasableProduct ? 0.9 : 0.72;
    reasons.push(hasPricedPurchasableProduct ? 'priced_purchasable_product' : 'product_role_majority');
    return freeze(businessModel, confidence, reasons);
  }

  // Service booking when booking provider/url exists
  if (hasBookingProvider || hasBookingUrl) {
    businessModel = 'service_booking';
    confidence = 0.92;
    reasons.push(hasBookingProvider ? 'booking_provider' : 'booking_url');
    return freeze(businessModel, confidence, reasons);
  }

  // Quote-led services (trades): categories / services without booking or buy
  if (
    hasQuoteSignal ||
    (hasServiceRoles && !hasPricedPurchasableProduct && (serviceCategoryCount >= 1 || serviceCount >= 1))
  ) {
    // Portfolio if projects dominate over service categories
    if (hasProjectRoles && serviceCategoryCount === 0 && productCount === 0) {
      businessModel = 'portfolio';
      confidence = 0.78;
      reasons.push('project_gallery_roles');
      return freeze(businessModel, confidence, reasons);
    }
    businessModel = 'service_quote';
    confidence = serviceCategoryCount >= 2 ? 0.9 : hasQuoteSignal ? 0.85 : 0.7;
    reasons.push(
      serviceCategoryCount >= 2
        ? 'service_category_coverage'
        : hasQuoteSignal
          ? 'quote_pricing_signal'
          : 'service_roles_without_booking',
    );
    return freeze(businessModel, confidence, reasons);
  }

  if (hasProjectRoles) {
    businessModel = 'portfolio';
    confidence = 0.7;
    reasons.push('project_gallery_roles');
    return freeze(businessModel, confidence, reasons);
  }

  // Weak legacy fallback (never invent booking from legacy alone if quote signals exist)
  if (legacy.includes('quote') || legacy === 'service_quote_required') {
    return freeze('service_quote', 0.65, ['legacy_business_type_quote']);
  }
  if (legacy.includes('booking') || legacy === 'service_fixed_booking') {
    return freeze('service_booking', 0.6, ['legacy_business_type_booking']);
  }
  if (legacy.includes('retail') || legacy === 'product_retail') {
    return freeze('retail', 0.6, ['legacy_business_type_retail']);
  }

  reasons.push('insufficient_evidence');
  return freeze('mixed', 0.4, reasons);
}

/**
 * @param {string} businessModel
 * @param {number} confidence
 * @param {string[]} reasons
 * @returns {BusinessModelInference}
 */
function freeze(businessModel, confidence, reasons) {
  if (!isBusinessModel(businessModel)) {
    throw new Error(`[designLibrary.policy] Invalid businessModel "${businessModel}"`);
  }
  return Object.freeze({
    businessModel,
    confidence: Math.max(0, Math.min(1, confidence)),
    reasons: Object.freeze([...reasons]),
    policyVersion: BUSINESS_MODEL_POLICY_VERSION,
  });
}
