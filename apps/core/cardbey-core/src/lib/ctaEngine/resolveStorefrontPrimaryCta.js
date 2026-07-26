/**
 * Phase 1 parity path — wraps existing commerce SSOT.
 * Products should call this instead of re-deriving Book/Order/Shop labels.
 */

import { resolveStoreCommerce } from '../storeTransactionMode.js';

/**
 * @param {{
 *   storeType?: string | null,
 *   businessType?: string | null,
 *   businessName?: string | null,
 *   commerceMode?: string | null,
 *   transactionMode?: string | null,
 *   items?: object[] | null,
 *   ctaLabel?: string | null,
 *   ctaAction?: string | null,
 *   catalogLabel?: string | null,
 * }} [input]
 * @returns {{
 *   label: string,
 *   action: string,
 *   commerceMode: string,
 *   capabilityId: string,
 *   source: 'cta_engine.storefront_primary',
 * }}
 */
export function resolveStorefrontPrimaryCta(input = {}) {
  const commerce = resolveStoreCommerce(input);
  const action = String(commerce.ctaAction || 'order');
  /** Map commerce action → store capability id */
  const capabilityId =
    action === 'booking' || action === 'book'
      ? 'store.book'
      : action === 'inquiry'
        ? 'store.enquire'
        : action === 'order' || action === 'shop'
          ? 'store.order'
          : 'store.visit';

  return {
    label: String(commerce.ctaLabel || 'Visit'),
    action,
    commerceMode: String(commerce.commerceMode || 'order'),
    capabilityId,
    source: 'cta_engine.storefront_primary',
  };
}
