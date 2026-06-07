// DANH: skill-round6-document
/**
 * create_products_from_document — add catalog products from extracted document data.
 */

import { getPrismaClient } from '../../prisma.js';
import { addProduct } from '../../catalog/productCatalogService.js';
import { execute as manageProductCatalog } from '../catalog/manage_product_catalog.js';

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
        created: false,
        count: 0,
        reason: 'No products in extracted document data',
        products: [],
      },
    };
  }

  const prisma = getPrismaClient();
  /** @type {Array<object>} */
  const created = [];
  /** @type {Array<object>} */
  const failed = [];

  for (const item of products.slice(0, 50)) {
    const name = String(item?.name ?? '').trim();
    if (!name) continue;

    try {
      const product = await addProduct(prisma, storeId, {
        name,
        description: item?.description ? String(item.description).slice(0, 2000) : null,
        price: item?.price != null && !Number.isNaN(Number(item.price)) ? Number(item.price) : null,
        category: item?.category ? String(item.category).slice(0, 120) : 'General',
        isPublished: false,
      });
      created.push({ productId: product.id, name: product.name, price: product.price });
    } catch (err) {
      failed.push({ name, error: err?.message ?? String(err) });
    }
  }

  // Also expose manage_product_catalog shape for observability
  if (created.length === 0 && products.length > 0) {
    const fallback = await manageProductCatalog(
      { storeId, action: 'get_summary' },
      context,
    );
    return {
      status: 'ok',
      output: {
        created: false,
        count: 0,
        failed,
        catalogSummary: fallback.output,
        reason: 'Could not create products from document',
      },
    };
  }

  return {
    status: 'ok',
    output: {
      created: created.length > 0,
      count: created.length,
      products: created,
      failed,
      message: `Added ${created.length} product(s) from document`,
    },
  };
}

export default execute;
