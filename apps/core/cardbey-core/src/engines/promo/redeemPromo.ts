/**
 * Redeem Promo Tool
 * Validate and record promotion redemption
 */

import { PrismaClient } from '@prisma/client';
import { getEventEmitter, PROMO_EVENTS } from './events.ts';
import type { RedeemPromoInput, RedeemPromoOutput } from './types.ts';
import type { EngineContext } from './configurePromo.ts';

const prisma = new PrismaClient();

/**
 * Redeem a promo
 * Validates promo, checks limits, creates redemption record, and increments usage
 * 
 * @param input - Redemption parameters
 * @param ctx - Execution context with services
 * @returns Discount information
 */
export const redeemPromo = async (
  input: RedeemPromoInput,
  ctx?: EngineContext
): Promise<RedeemPromoOutput> => {
  const { tenantId, storeId, promoId, customerId, deviceId, orderId } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();

  // Get promo
  const promo = await db.promoRule.findUnique({
    where: { id: promoId },
  });

  if (!promo) {
    throw new Error('Promo not found');
  }

  // Validate tenant/store match
  if (promo.tenantId !== tenantId || promo.storeId !== storeId) {
    throw new Error('Promo does not belong to this tenant/store');
  }

  // Check if promo is active
  if (!promo.active) {
    throw new Error('Promo is not active');
  }

  // Check date range
  const now = new Date();
  if (promo.startAt && now < promo.startAt) {
    throw new Error('Promo has not started yet');
  }
  if (promo.endAt && now > promo.endAt) {
    throw new Error('Promo has expired');
  }

  // Check usage limit
  if (promo.usageLimit !== null && promo.usageCount >= promo.usageLimit) {
    throw new Error('Promo usage limit reached');
  }

  // Create redemption record
  const redemption = await db.promoRuleRedemption.create({
    data: {
      tenantId,
      storeId,
      promoId,
      customerId: customerId || null,
      deviceId: deviceId || null,
      orderId: orderId || null,
    },
  });

  // Increment usage count
  await db.promoRule.update({
    where: { id: promoId },
    data: {
      usageCount: {
        increment: 1,
      },
    },
  });

  // Emit event
  await events.emit(PROMO_EVENTS.PROMO_REDEEMED, {
    tenantId,
    storeId,
    promoId,
    customerId: customerId || null,
    deviceId: deviceId || null,
    orderId: orderId || null,
    redemptionId: redemption.id,
  });

  return {
    ok: true,
    data: {
      discountType: promo.type,
      discountValue: promo.value,
      redemptionId: redemption.id,
    },
  };
};
