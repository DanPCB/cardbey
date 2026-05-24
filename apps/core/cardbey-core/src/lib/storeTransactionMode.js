/**
 * Single source of truth: service (booking) vs product (order) commerce mode.
 * Used at publish, API mapping, catalog generation, and mirrored in dashboard storeTransactionMode.ts.
 */

export const SERVICE_VERTICALS = [
  'beauty',
  'health',
  'sports',
  'arts_and_crafts',
  'arts & crafts',
  'arts and crafts',
  'hair',
  'salon',
  'spa',
  'fitness',
  'wellness',
  'medical',
  'dental',
  'coaching',
  'consulting',
  'service',
  'services',
  'barber',
  'physio',
  'clinic',
  'nail',
  'lash',
  'wax',
  'yoga',
  'pilates',
  'gym',
  'massage',
  'therapy',
  'tattoo',
  'studio',
];

/**
 * @param {string | null | undefined} businessType
 * @returns {boolean}
 */
export function isServiceVertical(businessType) {
  if (!businessType) return false;
  const normalized = String(businessType).toLowerCase().trim();
  if (!normalized) return false;
  return SERVICE_VERTICALS.some((v) => normalized.includes(v));
}

/**
 * @param {string | null | undefined} businessType
 * @returns {{ transactionMode: 'booking' | 'order', catalogLabel: string, ctaLabel: string, ctaAction: string }}
 */
/**
 * Normalize CTA copy for service/booking stores — DB default is often "Order now".
 * @param {{ businessType?: string | null, transactionMode?: string | null, ctaLabel?: string | null }} input
 * @returns {string}
 */
export function coerceServiceCtaLabel({ businessType, transactionMode, ctaLabel } = {}) {
  const trimmed = String(ctaLabel ?? '').trim();
  const isService =
    transactionMode === 'booking' || isServiceVertical(businessType);
  if (isService) {
    if (!trimmed || /^order\s+now$/i.test(trimmed)) return 'Book now';
    return trimmed;
  }
  if (!trimmed) return 'Order now';
  return trimmed;
}

export function resolveTransactionCommerce(businessType) {
  const isService = isServiceVertical(businessType);
  if (isService) {
    return {
      transactionMode: 'booking',
      catalogLabel: 'Services',
      ctaLabel: 'Book now',
      ctaAction: 'booking',
    };
  }
  const normalized = String(businessType || '').toLowerCase();
  const foodish = /\b(restaurant|cafe|coffee|bakery|baker|food|dining|kitchen|bar|bistro|eatery|pizza)\b/.test(normalized);
  if (foodish) {
    return {
      transactionMode: 'order',
      catalogLabel: 'Products',
      ctaLabel: 'Order now',
      ctaAction: 'order',
    };
  }
  return {
    transactionMode: 'order',
    catalogLabel: 'Products',
    ctaLabel: 'Order now',
    ctaAction: 'order',
  };
}
