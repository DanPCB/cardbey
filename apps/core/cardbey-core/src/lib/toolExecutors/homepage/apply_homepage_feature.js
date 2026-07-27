// AUDIT: no homepage feature flag on Product in prisma/schema.prisma — now uses isFeatured
// DANH: skill-round4-feature
// DANH: schema-gap-product-featured
/**
 * apply_homepage_feature — set featured flag on Product.
 * Side effect: DB write when isFeatured / featuredAt exist on Product.
 */

import { getPrismaClient } from '../../prisma.js';

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  const storeId = typeof input?.storeId === 'string' ? input.storeId.trim() : '';
  const productId = typeof input?.productId === 'string' ? input.productId.trim() : '';

  if (!storeId || !productId) {
    return {
      status: 'failed',
      output: { error: 'storeId and productId are required' },
    };
  }

  try {
    const prisma = getPrismaClient();
    const product = await prisma.product.update({
      where: { id: productId, businessId: storeId },
      data: {
        isFeatured: true, // DANH: schema-gap-product-featured
        featuredAt: new Date(), // DANH: schema-gap-product-featured
      },
    });
    return {
      status: 'ok',
      output: {
        featured: true,
        persisted: true,
        productId: product.id,
        productName: product.name,
      },
    };
  } catch (err) {
    return {
      status: 'ok',
      output: {
        featured: false,
        persisted: false,
        reason: err instanceof Error ? err.message : String(err),
        productId,
      },
    };
  }
}

export default execute;
