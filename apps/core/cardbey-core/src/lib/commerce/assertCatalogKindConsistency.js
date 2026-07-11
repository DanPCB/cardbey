/**
 * Guard: catalog items must match authoritative commerce profile.
 */

import { CatalogContractViolation } from './CatalogContractViolation.js';

/**
 * @param {import('./commerceProfileTypes.js').CatalogItem[]} catalogItems
 */
export function countCatalogItemsByKind(catalogItems = []) {
  const counts = {
    catalogItemCount: 0,
    serviceCount: 0,
    productCount: 0,
    menuItemCount: 0,
    appointmentCount: 0,
    rentalItemCount: 0,
    conversionActionCount: 0,
  };
  for (const item of catalogItems) {
    if (!item || typeof item !== 'object') continue;
    counts.catalogItemCount += 1;
    if (item.recordType === 'conversion_action') {
      counts.conversionActionCount += 1;
      continue;
    }
    const kind = String(item.itemKind ?? item.type ?? item.kind ?? '').toLowerCase();
    if (kind === 'service') counts.serviceCount += 1;
    else if (kind === 'product') counts.productCount += 1;
    else if (kind === 'menu_item') counts.menuItemCount += 1;
    else if (kind === 'appointment') counts.appointmentCount += 1;
    else if (kind === 'rental_item') counts.rentalItemCount += 1;
    else if (item.itemType === 'service' || item.type === 'service') counts.serviceCount += 1;
    else counts.productCount += 1;
  }
  return counts;
}

/**
 * @param {{
 *   businessCommerceProfile: import('./commerceProfileTypes.js').BusinessCommerceProfile,
 *   catalogItems: import('./commerceProfileTypes.js').CatalogItem[],
 *   storefrontSettings?: object,
 *   transactionMode?: string,
 *   strict?: boolean,
 * }} params
 */
export function assertCatalogKindConsistency(params) {
  const profile = params.businessCommerceProfile;
  const items = params.catalogItems ?? [];
  const catalogKind = profile?.catalogKind;
  const violations = [];

  if (!catalogKind) return { ok: true, violations: [], counts: countCatalogItemsByKind(items) };

  const counts = countCatalogItemsByKind(items);

  if (catalogKind === 'service') {
    const nonService = items.filter((item) => {
      if (!item || item.recordType === 'conversion_action') return false;
      const kind = String(item.itemKind ?? item.type ?? item.kind ?? item.itemType ?? '').toLowerCase();
      return kind !== 'service';
    });
    if (nonService.length > 0) {
      violations.push({
        code: 'CATALOG_KIND_INCORRECT',
        message: `Service catalog contains ${nonService.length} non-service item(s)`,
        items: nonService.map((i) => i.name).slice(0, 10),
      });
    }

    const productOnlyFields = items.filter(
      (item) =>
        item &&
        (item.sku != null ||
          item.inventory != null ||
          item.shippingWeight != null ||
          (item.purchaseEnabled === true && item.bookingEnabled !== true && item.priceMode !== 'free')),
    );
    if (productOnlyFields.length > 0) {
      violations.push({
        code: 'SERVICE_SCHEMA_INVALID',
        message: `${productOnlyFields.length} service item(s) carry product-only retail fields`,
        items: productOnlyFields.map((i) => i.name).slice(0, 10),
      });
    }
  }

  if (catalogKind === 'product' && counts.serviceCount > 0 && counts.productCount === 0) {
    violations.push({
      code: 'CATALOG_KIND_INCORRECT',
      message: 'Product catalog contains only service-shaped items',
    });
  }

  if (violations.length > 0) {
    console.warn('[CatalogContract] validated service catalog — violations', {
      catalogKind,
      businessKind: profile.businessKind,
      violations,
      counts,
    });
    if (params.strict !== false) {
      throw new CatalogContractViolation(violations[0].message, {
        code: violations[0].code,
        catalogKind,
        businessKind: profile.businessKind,
        details: { violations, counts },
      });
    }
  } else if (catalogKind === 'service') {
    console.log('[CatalogContract] validated service catalog', { counts });
  }

  return { ok: violations.length === 0, violations, counts };
}
