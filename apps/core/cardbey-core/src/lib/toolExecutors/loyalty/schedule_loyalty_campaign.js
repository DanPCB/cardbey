// AUDIT: assign_promotion_slot at promotion/assign_promotion_slot.js — slot assignment, not loyalty draft
// DANH: skill-round4-loyalty
// DANH: schema-gap-storepromo-type
/**
 * schedule_loyalty_campaign — persist loyalty promo draft when schema allows.
 * Side effect: writes StorePromo draft with promoType loyalty.
 */

import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../../prisma.js';

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  const storeId = typeof input?.storeId === 'string' ? input.storeId.trim() : '';
  const offers = Array.isArray(input?.offers) ? input.offers : [];
  const headline =
    String(offers[0]?.headline ?? '').trim() || 'Loyalty program launch';

  if (!storeId) {
    return {
      status: 'failed',
      output: { error: 'storeId is required' },
    };
  }

  try {
    const prisma = getPrismaClient();
    const slug = `loyalty-${storeId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
    const row = await prisma.storePromo.create({
      data: {
        storeId,
        promoType: 'loyalty', // DANH: schema-gap-storepromo-type
        title: headline,
        targetUrl: `/store/${storeId}`,
        slug,
        isActive: false,
        description: String(offers[0]?.rewardDescription ?? '').slice(0, 500) || null,
      },
    });
    return {
      status: 'ok',
      output: {
        scheduled: true,
        persisted: true,
        promoType: 'loyalty',
        promoId: row.id,
        title: row.title,
      },
    };
  } catch (err) {
    return {
      status: 'ok',
      output: {
        scheduled: false,
        persisted: false,
        reason: 'schema gap',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export default execute;
