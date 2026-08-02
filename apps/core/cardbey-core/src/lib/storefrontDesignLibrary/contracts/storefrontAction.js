/**
 * Canonical storefront actions (CTA vocabulary only).
 * Phase 1 — no CTA selection policy.
 */

export const STOREFRONT_ACTIONS = Object.freeze([
  'request_quote',
  'call',
  'book',
  'buy',
  'add_to_cart',
  'order',
  'reserve',
  'enquire',
  'contact',
  'get_directions',
  'view_services',
  'view_products',
]);

export const STOREFRONT_ACTION_SET = new Set(STOREFRONT_ACTIONS);

/** @param {unknown} action */
export function isStorefrontAction(action) {
  return typeof action === 'string' && STOREFRONT_ACTION_SET.has(action);
}
