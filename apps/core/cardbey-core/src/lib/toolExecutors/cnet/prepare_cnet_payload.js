// DANH: skill-round5-cnet
/**
 * prepare_cnet_payload — package store content for C-Net (read-only gather).
 */

import { getPrismaClient } from '../../prisma.js';

export async function execute(input = {}) {
  const storeId = typeof input?.storeId === 'string' ? input.storeId.trim() : '';
  const configured = input?.configured === true;

  if (!configured) {
    return {
      status: 'ok',
      output: {
        prepared: false,
        reason: 'C-Net not configured',
        required: ['CNET_API_KEY', 'CNET_ENDPOINT'],
      },
    };
  }

  if (!storeId) {
    return {
      status: 'failed',
      output: { error: 'storeId is required' },
    };
  }

  let payload = { storeId, products: [], promos: [] };

  try {
    const prisma = getPrismaClient();
    const [business, products, promos] = await Promise.all([
      prisma.business.findFirst({ where: { id: storeId }, select: { name: true, slug: true } }),
      prisma.product.findMany({
        where: { businessId: storeId, deletedAt: null, isPublished: true },
        take: 20,
        select: { id: true, name: true, description: true, imageUrl: true },
      }),
      prisma.storePromo.findMany({
        where: { storeId, isActive: true },
        take: 10,
        select: { id: true, title: true, targetUrl: true },
      }),
    ]);
    payload = {
      storeId,
      storeName: business?.name ?? null,
      storeSlug: business?.slug ?? null,
      products,
      promos,
    };
  } catch {
    /* return minimal payload */
  }

  return {
    status: 'ok',
    output: {
      prepared: true,
      payload,
    },
  };
}

export default execute;
