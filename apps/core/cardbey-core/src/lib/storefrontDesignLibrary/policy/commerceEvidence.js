/**
 * Gather commerce / booking / quote evidence for Phase 3 inference.
 * Read-only — does not mutate storefront authority.
 */

/**
 * @typedef {{
 *   hasBookingProvider: boolean,
 *   hasBookingUrl: boolean,
 *   hasPricedPurchasableProduct: boolean,
 *   hasExplicitPrice: boolean,
 *   hasQuoteSignal: boolean,
 *   hasPhone: boolean,
 *   hasDeliveryOrder: boolean,
 *   hasReservationSignal: boolean,
 *   hasMenuRoles: boolean,
 *   hasProductRoles: boolean,
 *   hasServiceRoles: boolean,
 *   hasProjectRoles: boolean,
 *   serviceCategoryCount: number,
 *   serviceCount: number,
 *   productCount: number,
 *   menuItemCount: number,
 *   roleCounts: Record<string, number>,
 *   legacyBusinessType: string | null,
 * }} CommerceEvidenceBundle
 */

/**
 * @param {unknown[]} products
 * @param {Record<string, unknown>} [context]
 * @returns {CommerceEvidenceBundle}
 */
export function gatherCommerceEvidence(products, context = {}) {
  const list = Array.isArray(products) ? products : [];
  /** @type {Record<string, number>} */
  const roleCounts = {};
  let hasPricedPurchasableProduct = false;
  let hasExplicitPrice = false;
  let hasQuoteSignal = false;
  let serviceCategoryCount = 0;
  let serviceCount = 0;
  let productCount = 0;
  let menuItemCount = 0;

  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const item = /** @type {Record<string, unknown>} */ (raw);
    const role = String(item.contentRole ?? '').trim();
    if (role) roleCounts[role] = (roleCounts[role] ?? 0) + 1;
    if (role === 'service_category') serviceCategoryCount += 1;
    if (role === 'service') serviceCount += 1;
    if (role === 'product' || role === 'product_category') productCount += 1;
    if (role === 'menu_item' || role === 'menu_category') menuItemCount += 1;

    const priceOk =
      item.price != null &&
      item.price !== '' &&
      item.priceWasNotExplicitlyProvided !== true;
    if (priceOk) hasExplicitPrice = true;

    const purchase =
      item.purchaseEnabled === true ||
      /\b(buy|add[_ ]?to[_ ]?cart|purchase)\b/i.test(String(item.primaryAction ?? item.executionAction ?? ''));
    if (priceOk && (purchase || item.sku || role === 'product')) {
      hasPricedPurchasableProduct = true;
    }

    const quoteish =
      item.pricingMode === 'quote' ||
      /\b(quote|enquire|inquiry|estimate)\b/i.test(String(item.ctaLabel ?? item.primaryAction ?? '')) ||
      item.priceWasNotExplicitlyProvided === true;
    if (quoteish && (role === 'service' || role === 'service_category' || !role)) {
      hasQuoteSignal = true;
    }
  }

  const bookingUrl = String(
    context.bookingUrl ?? context.research?.bookingUrl ?? context.facts?.bookingUrl ?? '',
  ).trim();
  const bookingProvider = String(
    context.bookingProvider ?? context.research?.bookingProvider ?? '',
  ).trim();
  const sources = Array.isArray(context.sourcesUsed)
    ? context.sourcesUsed
    : Array.isArray(context.research?.sourcesUsed)
      ? context.research.sourcesUsed
      : [];
  const hasBookingSource = sources.some(
    (s) => s && typeof s === 'object' && String(s.sourceType ?? '').includes('booking'),
  );

  const phone = String(
    context.phone ?? context.research?.facts?.phone ?? context.businessProfile?.phone ?? '',
  ).trim();

  const delivery = Boolean(
    context.deliveryUrl ||
      context.research?.facts?.deliveryUrl ||
      /\b(uber\s*eats|deliveroo|menulog|doordash)\b/i.test(JSON.stringify(context.research?.facts ?? {})),
  );

  const reservation = Boolean(
    context.reservationUrl ||
      context.research?.facts?.reservationUrl ||
      /\b(opentable|resy|whenfree|bookatable)\b/i.test(JSON.stringify(context.research?.facts ?? {})),
  );

  const legacyBusinessType = String(
    context.businessType ?? context.businessProfile?.businessType ?? context.research?.businessProfile?.businessType ?? '',
  ).trim() || null;

  // Quote-led trades: many categories, no booking, no purchasable products
  if (
    serviceCategoryCount >= 2 &&
    !bookingUrl &&
    !bookingProvider &&
    !hasBookingSource &&
    !hasPricedPurchasableProduct
  ) {
    hasQuoteSignal = true;
  }

  return {
    hasBookingProvider: Boolean(bookingProvider) || hasBookingSource,
    hasBookingUrl: Boolean(bookingUrl),
    hasPricedPurchasableProduct,
    hasExplicitPrice,
    hasQuoteSignal,
    hasPhone: Boolean(phone),
    hasDeliveryOrder: delivery,
    hasReservationSignal: reservation,
    hasMenuRoles: menuItemCount > 0 || (roleCounts.menu_item ?? 0) > 0 || (roleCounts.menu_category ?? 0) > 0,
    hasProductRoles: productCount > 0,
    hasServiceRoles: serviceCount + serviceCategoryCount > 0,
    hasProjectRoles: (roleCounts.project ?? 0) + (roleCounts.gallery ?? 0) > 0 && serviceCategoryCount < 2,
    serviceCategoryCount,
    serviceCount,
    productCount,
    menuItemCount,
    roleCounts,
    legacyBusinessType,
  };
}
