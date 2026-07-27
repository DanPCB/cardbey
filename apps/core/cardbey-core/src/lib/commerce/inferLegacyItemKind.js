/**
 * Infer catalog item kind from legacy product-shaped records.
 */

import { CONVERSION_ACTION_NAMES } from './commerceProfileTypes.js';
import { resolveCommerceProfile } from './resolveCommerceProfile.js';

/**
 * @param {object} record
 * @param {import('./commerceProfileTypes.js').BusinessCommerceProfile} [storeProfile]
 */
export function inferLegacyItemKind(record, storeProfile) {
  if (!record || typeof record !== 'object') return 'product';

  const explicit = String(record.itemKind ?? record.itemType ?? record.type ?? record.kind ?? '').toLowerCase();
  if (['service', 'product', 'menu_item', 'appointment', 'rental_item'].includes(explicit)) {
    return /** @type {import('./commerceProfileTypes.js').CatalogItemKind} */ (explicit);
  }

  const name = String(record.name ?? record.title ?? '').toLowerCase().trim();
  if (CONVERSION_ACTION_NAMES.has(name) || record.recordType === 'conversion_action') {
    return 'service';
  }

  if (record.serviceMode || record.bookingMode || record.serviceCatalog) return 'service';
  if (record.bookingEnabled === true || record.primaryAction === 'book' || record.primaryAction === 'enquire') {
    return 'service';
  }
  if (record.sku || record.inventory != null) return 'product';

  if (storeProfile?.catalogKind === 'service') return 'service';
  if (storeProfile?.catalogKind === 'menu_item') return 'menu_item';
  if (storeProfile?.catalogKind === 'product') return 'product';

  return 'product';
}

/**
 * @param {object} record
 * @param {object} [ctx]
 * @returns {import('./commerceProfileTypes.js').CatalogItem}
 */
export function migrateLegacyCatalogRecord(record, ctx = {}) {
  const storeProfile =
    ctx.businessCommerceProfile ??
    resolveCommerceProfile({
      businessName: ctx.businessName,
      storeType: ctx.businessType ?? ctx.storeType,
      verticalSlug: ctx.verticalSlug,
      location: ctx.location,
      currencyCode: ctx.currencyCode,
    });

  const itemKind = inferLegacyItemKind(record, storeProfile);
  const base = { ...record, itemKind };

  if (itemKind === 'service') {
    base.itemType = 'service';
    base.type = 'service';
    base.kind = 'service';
    base.purchaseEnabled = false;
    if (!base.priceMode) {
      const hasOwnerPrice = record.priceProvenance === 'owner' || record.ownerEnteredPrice === true;
      const hasEvidence =
        hasOwnerPrice ||
        record.priceProvenance === 'research' ||
        (typeof record.fromPrice === 'number' && record.priceProvenance === 'blueprint');
      if (!hasEvidence && (record.price != null || record.fromPrice != null)) {
        base.priceMode = 'quote_required';
        if (!hasOwnerPrice) {
          base.price = undefined;
          base.fromPrice = undefined;
          base.priceProvenance = null;
        }
      } else if (record.fromPrice != null) {
        base.priceMode = 'starting_from';
      } else if (/\bfree\b/i.test(String(record.name ?? ''))) {
        base.priceMode = 'free';
      } else {
        base.priceMode = base.priceMode ?? 'quote_required';
      }
    }
    if (base.currencyCode == null && storeProfile.currencyCode) {
      base.currencyCode = storeProfile.currencyCode;
      base.currency = storeProfile.currencyCode;
    }
  }

  return /** @type {import('./commerceProfileTypes.js').CatalogItem} */ (base);
}
