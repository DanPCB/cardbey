/**
 * manage_product_catalog — product catalog CRUD and summary (Round 2).
 * DANH: skill-round2-catalog
 */

import { getPrismaClient } from '../../prisma.js';
import {
  addProduct,
  getCatalogSummary,
  listProducts,
  removeProduct,
  updatePricing,
  updateProduct,
} from '../../catalog/productCatalogService.js';

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
      output: { ok: false, error: 'storeId is required' },
    };
  }

  const action = String(input?.action ?? 'get_summary').trim();
  const prisma = getPrismaClient();

  try {
    switch (action) {
      case 'list_products': {
        const products = await listProducts(prisma, storeId, {
          category: input?.category,
          limit: input?.limit,
        });
        // Side effect: read active products for store from DB.
        return {
          status: 'ok',
          output: {
            ok: true,
            skillId: 'product_catalog',
            subIntent: 'list_products',
            products,
            count: products.length,
            message: `Found ${products.length} products`,
          },
        };
      }
      case 'add_product': {
        const product = await addProduct(prisma, storeId, input);
        // Side effect: inserted Product row for businessId=storeId.
        return {
          status: 'ok',
          output: {
            ok: true,
            skillId: 'product_catalog',
            subIntent: 'add_product',
            productId: product.id,
            product,
            message: `Added ${product.name} to catalog`,
          },
        };
      }
      case 'update_product': {
        const productId = input?.productId;
        if (!productId) {
          return {
            status: 'failed',
            error: { code: 'VALIDATION_ERROR', message: 'productId is required' },
          };
        }
        const product = await updateProduct(prisma, productId, input);
        // Side effect: updated Product row by id.
        return {
          status: 'ok',
          output: {
            ok: true,
            skillId: 'product_catalog',
            subIntent: 'update_product',
            productId,
            product,
            message: `Updated ${product.name}`,
          },
        };
      }
      case 'remove_product': {
        const productId = input?.productId;
        if (!productId) {
          return {
            status: 'failed',
            error: { code: 'VALIDATION_ERROR', message: 'productId is required' },
          };
        }
        await removeProduct(prisma, productId);
        // Side effect: soft-deleted Product (deletedAt set).
        return {
          status: 'ok',
          output: {
            ok: true,
            skillId: 'product_catalog',
            subIntent: 'remove_product',
            productId,
            removed: true,
            message: 'Product removed from catalog',
          },
        };
      }
      case 'update_pricing': {
        const results = await updatePricing(prisma, storeId, input?.updates ?? []);
        // Side effect: batch-updated Product.price for listed ids.
        return {
          status: 'ok',
          output: {
            ok: true,
            skillId: 'product_catalog',
            subIntent: 'update_pricing',
            updated: results.length,
            message: `Updated pricing for ${results.length} products`,
          },
        };
      }
      case 'get_summary':
      default: {
        const summary = await getCatalogSummary(prisma, storeId);
        // Side effect: counted Product rows grouped by category.
        return {
          status: 'ok',
          output: {
            ok: true,
            skillId: 'product_catalog',
            subIntent: 'get_summary',
            ...summary,
            message: `${summary.total} products across ${summary.byCategory.length} categories`,
          },
        };
      }
    }
  } catch (err) {
    return {
      status: 'failed',
      error: { message: err?.message ?? String(err) },
      output: { ok: false },
    };
  }
}

export default execute;
