/**
 * Apply draft catalog items onto a committed Business Product table.
 * Used after owner-confirmed menu replace so Catalog / live storefront match.
 */

import { prisma } from '../../lib/prisma.js';
import { buildCategoryIdToNameMap } from '../draftStore/draftStoreService.js';
import {
  prepareCatalogProductRows,
  replaceStoreCatalogInBatches,
  attachBusinessIdToProductRows,
} from '../draftStore/stagedCatalogPublish.js';
import {
  resolveCommerceMode,
  commerceModeToTransactionMode,
  isServiceVertical,
} from '../../lib/storeTransactionMode.js';
import { inferCatalogSectionLabel } from '../../lib/catalog/catalogItemClassification.js';

/**
 * Drop empty names and section-header-only rows (name equals category, no price/desc).
 * @param {object[]} items
 */
export function filterCatalogApplyItems(items) {
  return (items || []).filter((it) => {
    if (!it || typeof it !== 'object') return false;
    const name = typeof it.name === 'string' ? it.name.trim() : '';
    if (!name) return false;
    const category = typeof it.category === 'string' ? it.category.trim() : '';
    const description = typeof it.description === 'string' ? it.description.trim() : '';
    const price = it.price;
    const hasPrice = price != null && Number.isFinite(Number(price));
    const hasDuration =
      it.durationMinutes != null && Number.isFinite(Number(it.durationMinutes));
    const hasInclusions = Array.isArray(it.inclusions) && it.inclusions.length > 0;
    if (
      category &&
      name.toLowerCase() === category.toLowerCase() &&
      !hasPrice &&
      !description &&
      !hasDuration &&
      !hasInclusions
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Replace Business products from draft catalog items (replace mode only).
 *
 * @param {{
 *   businessId: string,
 *   items: object[],
 *   categories?: object[],
 *   draftId?: string,
 *   businessName?: string | null,
 *   businessType?: string | null,
 *   currency?: string | null,
 * }} args
 */
export async function applyDraftCatalogToCommittedStore(args) {
  const businessId = String(args.businessId || '').trim();
  if (!businessId) {
    const err = new Error('businessId is required');
    err.statusCode = 400;
    throw err;
  }

  const filtered = filterCatalogApplyItems(args.items);
  if (!filtered.length) {
    const err = new Error('No valid catalog items to apply to the store.');
    err.statusCode = 400;
    err.code = 'items_required';
    throw err;
  }

  const categoryMap = buildCategoryIdToNameMap(args.categories || []);
  const otherCategoryName = categoryMap.get('other') ?? 'Other';
  const currency =
    (typeof args.currency === 'string' && args.currency.trim().toUpperCase()) || 'AUD';

  const { rows, preparedCount } = prepareCatalogProductRows(filtered, {
    categoryMap,
    otherCategoryName,
    defaultCurrency: currency,
    businessType: args.businessType || null,
    businessName: args.businessName || null,
  });

  if (!preparedCount || !rows.length) {
    const err = new Error('No valid catalog items after normalization.');
    err.statusCode = 400;
    err.code = 'items_required';
    throw err;
  }

  const withBusiness = attachBusinessIdToProductRows(rows, businessId);

  // Keep a rollback snapshot: replaceStoreCatalogInBatches uses short independent
  // transactions, so a later batch failure must not leave the live store empty.
  const priorRows = await prisma.product.findMany({ where: { businessId } });
  let write;
  try {
    await prisma.product.deleteMany({ where: { businessId } });
    write = await replaceStoreCatalogInBatches(prisma, {
      businessId,
      rows: withBusiness,
      draftId: args.draftId,
    });
  } catch (err) {
    console.error('[MENU_APPLY_STORE] write failed; restoring prior catalog', {
      businessId,
      draftId: args.draftId ?? null,
      priorCount: priorRows.length,
      message: err?.message || String(err),
    });
    await prisma.product.deleteMany({ where: { businessId } });
    if (priorRows.length) {
      await replaceStoreCatalogInBatches(prisma, {
        businessId,
        rows: priorRows,
        draftId: args.draftId ? `${args.draftId}:rollback` : 'menu-apply-rollback',
      });
    }
    throw err;
  }

  console.log('[MENU_APPLY_STORE]', {
    businessId,
    draftId: args.draftId ?? null,
    preparedCount,
    written: write?.written ?? 0,
  });

  // Align Business commerce defaults with catalog kind (Beauty/spa should not stay on order/Products).
  try {
    const bizType = args.businessType || null;
    if (isServiceVertical(bizType) || String(bizType || '').toLowerCase().includes('beauty')) {
      const mode = resolveCommerceMode(bizType, {
        businessName: args.businessName,
        commerceMode: 'booking',
      });
      const transactionMode = commerceModeToTransactionMode(mode);
      const catalogLabel = inferCatalogSectionLabel(bizType, mode, args.businessName) || 'Services';
      await prisma.business.update({
        where: { id: businessId },
        data: {
          transactionMode,
          catalogLabel,
          ctaLabel: 'Book now',
        },
      });
    }
  } catch (commerceErr) {
    console.warn(
      '[MENU_APPLY_STORE] commerce field sync skipped:',
      commerceErr?.message || commerceErr,
    );
  }

  return {
    ok: true,
    storeId: businessId,
    productCount: write?.written ?? preparedCount,
  };
}
