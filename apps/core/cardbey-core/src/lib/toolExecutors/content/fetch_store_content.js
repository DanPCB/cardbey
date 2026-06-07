// AUDIT: rewrite_descriptions at store/rewrite_descriptions.js — LLM rewrite, shared fetch pattern new here
// DANH: skill-round4-content
/**
 * fetch_store_content — read product names and descriptions (read-only).
 * Side effect: read-only DB query.
 */

import { getPrismaClient } from '../../prisma.js';

/**
 * @param {object} [input]
 * @param {string} [input.storeId]
 */
export async function execute(input = {}) {
  const storeId = typeof input?.storeId === 'string' ? input.storeId.trim() : '';
  if (!storeId) {
    return {
      status: 'failed',
      output: { error: 'storeId is required', products: [], count: 0 },
    };
  }

  try {
    const prisma = getPrismaClient();
    const products = await prisma.product.findMany({
      where: { businessId: storeId, deletedAt: null },
      select: { id: true, name: true, description: true },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      status: 'ok',
      output: {
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description ?? null,
        })),
        count: products.length,
      },
    };
  } catch {
    return {
      status: 'ok',
      output: { products: [], count: 0 },
    };
  }
}

export default execute;
