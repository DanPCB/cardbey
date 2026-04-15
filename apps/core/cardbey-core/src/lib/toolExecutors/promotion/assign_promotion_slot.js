/**
 * Promotion tool: assign_promotion_slot.
 * Creates or validates PromotionPlacement for slotKey + promotionId (+ optional storeId).
 * Input: { slotKey, promotionId, storeId? } (from mission metadata).
 */

import { getPrismaClient } from '../../../lib/prisma.js';

/**
 * @param {object} input
 * @param {string} [input.slotKey]
 * @param {string} [input.promotionId]
 * @param {string} [input.storeId]
 * @returns {Promise<{ status: 'ok', output: { slotKey: string, promotionId: string, placementCreated: boolean } } | { status: 'blocked' | 'failed', blocker?: object, error?: object }>}
 */
export async function execute(input = {}) {
  const slotKey = typeof input.slotKey === 'string' ? input.slotKey.trim() : '';
  const promotionId = typeof input.promotionId === 'string' ? input.promotionId.trim() : '';
  const storeId = typeof input.storeId === 'string' ? input.storeId.trim() || null : null;

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[PromotionSlotTool] assigning slot=${slotKey} promotion=${promotionId} store=${storeId ?? 'none'}`);
  }

  if (!slotKey) {
    return {
      status: 'blocked',
      blocker: { code: 'MISSING_SLOT_KEY', message: 'slotKey is required', requiredAction: 'Provide slotKey in mission metadata' },
    };
  }
  if (!promotionId) {
    return {
      status: 'blocked',
      blocker: { code: 'MISSING_PROMOTION_ID', message: 'promotionId is required', requiredAction: 'Provide promotionId in mission metadata' },
    };
  }

  const prisma = getPrismaClient();

  const slot = await prisma.promotionSlot.findFirst({
    where: { slotKey, isActive: true },
    select: { id: true },
  });
  if (!slot) {
    return {
      status: 'failed',
      error: { code: 'SLOT_NOT_FOUND', message: `Active slot not found for slotKey=${slotKey}` },
    };
  }

  const promotion = await prisma.promotion.findUnique({
    where: { id: promotionId },
    select: { id: true },
  });
  if (!promotion) {
    return {
      status: 'failed',
      error: { code: 'PROMOTION_NOT_FOUND', message: `Promotion not found: ${promotionId}` },
    };
  }

  const existing = await prisma.promotionPlacement.findFirst({
    where: {
      promotionId,
      slotId: slot.id,
      storeId: storeId ?? null,
    },
  });

  if (existing) {
    return {
      status: 'ok',
      output: {
        slotKey,
        promotionId,
        placementCreated: false,
        placementId: existing.id,
      },
    };
  }

  const placement = await prisma.promotionPlacement.create({
    data: {
      promotionId,
      slotId: slot.id,
      storeId,
      enabled: true,
      priority: 0,
    },
  });

  return {
    status: 'ok',
    output: {
      slotKey,
      promotionId,
      placementCreated: true,
      placementId: placement.id,
    },
  };
}
