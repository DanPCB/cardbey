/**
 * CTA decision policy (Phase 3).
 *
 * Evidence-driven. Never infer Book/Buy solely from a preview sample chrome.
 * Advisory only — does not replace resolveStoreCommerce / renderer.
 */

import { isStorefrontAction } from '../contracts/storefrontAction.js';

export const CTA_POLICY_VERSION = 1;

/** @type {Readonly<Record<string, string>>} */
export const ACTION_LABELS = Object.freeze({
  request_quote: 'Request a quote',
  call: 'Call now',
  book: 'Book',
  buy: 'Buy',
  add_to_cart: 'Add to cart',
  order: 'Order now',
  reserve: 'Reserve table',
  enquire: 'Enquire',
  contact: 'Contact',
  get_directions: 'Get directions',
  view_services: 'View services',
  view_products: 'View products',
});

/**
 * @typedef {{
 *   action: string,
 *   label: string,
 * }} CtaActionChoice
 *
 * @typedef {{
 *   primary: CtaActionChoice,
 *   secondary: CtaActionChoice | null,
 *   reasons: string[],
 *   policyVersion: number,
 *   businessModel: string,
 * }} CtaDecision
 */

/**
 * @param {string} action
 * @returns {CtaActionChoice}
 */
export function actionChoice(action) {
  if (!isStorefrontAction(action)) {
    throw new Error(`[designLibrary.policy] Invalid storefront action "${action}"`);
  }
  return Object.freeze({
    action,
    label: ACTION_LABELS[action] ?? action,
  });
}

/**
 * @param {string} businessModel
 * @param {import('./commerceEvidence.js').CommerceEvidenceBundle} evidence
 * @returns {CtaDecision}
 */
export function resolveCtaDecision(businessModel, evidence) {
  const reasons = [];
  let primaryAction = 'enquire';
  /** @type {string | null} */
  let secondaryAction = null;

  const {
    hasBookingProvider,
    hasBookingUrl,
    hasPricedPurchasableProduct,
    hasQuoteSignal,
    hasPhone,
    hasDeliveryOrder,
    hasReservationSignal,
    hasMenuRoles,
  } = evidence;

  // Rule order from product brief (evidence first)
  if (hasBookingProvider || hasBookingUrl) {
    primaryAction = 'book';
    reasons.push(hasBookingProvider ? 'booking_provider_exists' : 'booking_url_exists');
    secondaryAction = hasPhone ? 'call' : 'contact';
  } else if (hasPricedPurchasableProduct) {
    primaryAction = 'buy';
    reasons.push('priced_purchasable_product');
    secondaryAction = 'add_to_cart';
  } else if (hasDeliveryOrder && (businessModel === 'restaurant' || hasMenuRoles)) {
    primaryAction = 'order';
    reasons.push('delivery_ordering_evidence');
    secondaryAction = hasReservationSignal ? 'reserve' : hasPhone ? 'call' : 'get_directions';
  } else if (hasReservationSignal && (businessModel === 'restaurant' || hasMenuRoles)) {
    primaryAction = 'reserve';
    reasons.push('restaurant_reservation_evidence');
    secondaryAction = hasPhone ? 'call' : 'get_directions';
  } else if (
    businessModel === 'service_quote' ||
    (hasQuoteSignal && !hasBookingUrl && !hasBookingProvider && !hasPricedPurchasableProduct)
  ) {
    primaryAction = 'request_quote';
    reasons.push('quote_based_service');
    secondaryAction = hasPhone ? 'call' : 'enquire';
  } else if (businessModel === 'service_booking') {
    // Booking model but no provider URL yet — do not invent Book
    primaryAction = 'enquire';
    reasons.push('service_booking_without_provider');
    secondaryAction = hasPhone ? 'call' : 'contact';
  } else if (businessModel === 'retail') {
    primaryAction = hasPricedPurchasableProduct ? 'buy' : 'view_products';
    reasons.push(hasPricedPurchasableProduct ? 'retail_purchasable' : 'retail_without_price_evidence');
    secondaryAction = 'contact';
  } else if (businessModel === 'restaurant') {
    primaryAction = hasDeliveryOrder ? 'order' : hasReservationSignal ? 'reserve' : 'enquire';
    reasons.push('restaurant_model');
    secondaryAction = hasPhone ? 'call' : 'get_directions';
  } else if (businessModel === 'portfolio') {
    primaryAction = 'enquire';
    reasons.push('portfolio_model');
    secondaryAction = hasQuoteSignal ? 'request_quote' : hasPhone ? 'call' : 'contact';
  } else if (hasPhone && hasQuoteSignal) {
    // Phone-led local service without booking
    primaryAction = 'request_quote';
    secondaryAction = 'call';
    reasons.push('phone_led_quote_service');
  } else if (hasPhone && !hasPricedPurchasableProduct) {
    primaryAction = 'call';
    secondaryAction = 'enquire';
    reasons.push('phone_led_local_service');
  } else {
    primaryAction = 'enquire';
    reasons.push('uncertain_service');
    secondaryAction = hasPhone ? 'call' : 'contact';
  }

  // Never promote Book without booking evidence (guard)
  if (primaryAction === 'book' && !hasBookingProvider && !hasBookingUrl) {
    primaryAction = 'enquire';
    reasons.push('blocked_book_without_evidence');
  }
  // Never promote Buy without purchasable evidence
  if ((primaryAction === 'buy' || primaryAction === 'add_to_cart') && !hasPricedPurchasableProduct) {
    primaryAction = 'enquire';
    reasons.push('blocked_buy_without_evidence');
  }

  return Object.freeze({
    primary: actionChoice(primaryAction),
    secondary: secondaryAction ? actionChoice(secondaryAction) : null,
    reasons: Object.freeze([...reasons]),
    policyVersion: CTA_POLICY_VERSION,
    businessModel,
  });
}
