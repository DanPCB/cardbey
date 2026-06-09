// DANH: skill-round6-document
/**
 * create_products_from_document — add catalog products from extracted document data.
 */

import { normalizeProductName } from '../../catalog/productCatalogService.js';
import { getPrismaClient } from '../../prisma.js';
import { execute as manageProductCatalog } from '../catalog/manage_product_catalog.js';

/**
 * @param {string | null | undefined} raw
 * @returns {Date | null}
 */
function parseBestEffortDate(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {object} item
 */
function buildProductPayload(item) {
  const name = String(item?.name ?? '').trim();
  const highlights = Array.isArray(item?.highlights) ? item.highlights.map(String) : [];
  const venues = Array.isArray(item?.venues) ? item.venues.map(String) : [];
  const location = String(item?.location ?? '').trim();
  const pricingTiers = Array.isArray(item?.pricing) ? item.pricing : [];
  const dates = String(item?.dates ?? item?.deadline ?? '').trim();

  const descriptionParts = [
    highlights.length ? highlights.join(', ') : '',
    item?.description ? String(item.description) : '',
    dates ? `Available: ${dates}` : '',
    pricingTiers.length ? `Pricing: ${JSON.stringify(pricingTiers)}` : '',
  ].filter(Boolean);

  const tags = [...venues, location].filter(Boolean);
  const firstPrice = pricingTiers.find((p) => p?.price != null);
  const legacyPrice = item?.price != null && !Number.isNaN(Number(item.price)) ? Number(item.price) : null;

  return {
    name,
    description: descriptionParts.join(' | ').slice(0, 2000) || null,
    price: firstPrice?.price != null ? Number(firstPrice.price) : legacyPrice,
    currency: firstPrice?.currency ? String(firstPrice.currency) : undefined,
    category: tags.length
      ? tags.join(', ').slice(0, 120)
      : item?.category
        ? String(item.category).slice(0, 120)
        : 'General',
    isPublished: false,
    availabilityStartDate: parseBestEffortDate(dates),
    metadata: { pricingTiers },
  };
}

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const storeId =
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    (typeof context?.storeId === 'string' && context.storeId.trim()) ||
    null;

  if (!storeId) {
    return {
      status: 'failed',
      error: { code: 'VALIDATION_ERROR', message: 'storeId is required' },
    };
  }

  const extracted = input?.extracted === true;
  const data = input?.data && typeof input.data === 'object' ? input.data : null;
  const products = Array.isArray(data?.products) ? data.products : [];

  if (!extracted || !products.length) {
    return {
      status: 'ok',
      output: {
        created: [],
        skipped: [],
        errors: [],
        count: 0,
        reason: 'No products in extracted document data',
      },
    };
  }

  /** @type {string[]} */
  const created = [];
  /** @type {Array<{ name: string, reason: string }>} */
  const skipped = [];
  /** @type {Array<{ name: string, error: string }>} */
  const errors = [];
  const prisma = getPrismaClient();

  for (const item of products.slice(0, 50)) {
    const payload = buildProductPayload(item);
    if (!payload.name) {
      skipped.push({ name: '(unnamed)', reason: 'missing_name' });
      continue;
    }

    const existing = await prisma.product.findFirst({
      where: { businessId: storeId, normalizedName: normalizeProductName(payload.name) },
    });
    if (existing) {
      skipped.push({ name: payload.name, reason: 'duplicate_name' });
      continue;
    }

    try {
      const result = await manageProductCatalog(
        {
          storeId,
          action: 'add_product',
          name: payload.name,
          description: payload.description,
          price: payload.price,
          currency: payload.currency,
          category: payload.category,
          isPublished: payload.isPublished,
        },
        { ...context, storeId },
      );

      if (result.status === 'ok' && result.output?.productId) {
        created.push(result.output.productId);
      } else {
        errors.push({
          name: payload.name,
          error: result.error?.message ?? 'add_product failed',
        });
      }
    } catch (err) {
      errors.push({ name: payload.name, error: err?.message ?? String(err) });
    }
  }

  return {
    status: 'ok',
    output: {
      created,
      skipped,
      errors,
      count: created.length,
      products: created.map((productId) => ({ productId })),
      message: `Added ${created.length} product(s) from document`,
    },
  };
}

export default execute;
