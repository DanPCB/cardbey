// AUDIT: no homepage feature tool found — new executor (Round 4)
// DANH: skill-round4-feature
/**
 * identify_feature_target — resolve product to feature from store catalog (read-only).
 * Side effect: read-only DB query.
 */

import { getPrismaClient } from '../../prisma.js';

/**
 * @param {string} message
 * @param {Array<{ id: string, name: string, description?: string | null }>} products
 */
export function matchProductFromMessage(message, products) {
  const msg = String(message ?? '').toLowerCase();
  if (!msg || !products.length) return { product: products[0] ?? null, matchMethod: 'recent' };

  for (const p of products) {
    const name = String(p.name ?? '').toLowerCase();
    if (name && msg.includes(name)) {
      return { product: p, matchMethod: 'named' };
    }
  }

  const words = msg.split(/\s+/).filter((w) => w.length > 3);
  for (const p of products) {
    const name = String(p.name ?? '').toLowerCase();
    if (words.some((w) => name.includes(w))) {
      return { product: p, matchMethod: 'named' };
    }
  }

  return { product: products[0], matchMethod: 'recent' };
}

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  const storeId = typeof input?.storeId === 'string' ? input.storeId.trim() : '';
  const userMessage = typeof input?.userMessage === 'string' ? input.userMessage : '';

  if (!storeId) {
    return {
      status: 'failed',
      output: { error: 'storeId is required' },
    };
  }

  try {
    const prisma = getPrismaClient();
    const products = await prisma.product.findMany({
      where: { businessId: storeId, deletedAt: null },
      orderBy: [
        { isFeatured: 'asc' }, // DANH: schema-gap-product-featured — unfeatured first
        { updatedAt: 'desc' },
      ],
      take: 5,
      select: { id: true, name: true, description: true },
    });

    if (!products.length) {
      return {
        status: 'ok',
        output: {
          targetProduct: null,
          matchMethod: 'recent',
          reason: 'No products found',
        },
      };
    }

    const { product, matchMethod } = matchProductFromMessage(userMessage, products);

    return {
      status: 'ok',
      output: {
        targetProduct: product
          ? {
              id: product.id,
              name: product.name,
              description: product.description ?? null,
            }
          : null,
        matchMethod,
      },
    };
  } catch {
    return {
      status: 'ok',
      output: { targetProduct: null, matchMethod: 'recent', reason: 'query failed' },
    };
  }
}

export default execute;
