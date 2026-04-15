/**
 * Redeem Promo Tool
 * Validate and record promo redemption
 */

import { PrismaClient } from '@prisma/client';
import { getEventEmitter, PROMO_EVENTS } from './events.js';

const prisma = new PrismaClient();

/**
 * Redeem a promo
 * Validates promo eligibility and records redemption
 */
export const redeemPromo = async (input, ctx) => {
  const { tenantId, storeId, promoId, customerId, deviceId } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();

  // Get promo
  const promo = await db.promoRule.findFirst({
    where: {
      id: promoId,
      tenantId,
      storeId,
    },
  });

  if (!promo) {
    throw new Error(`Promo not found: ${promoId}`);
  }

  // Check if active
  if (!promo.active) {
    throw new Error('Promo is not active');
  }

  // Check date range
  const now = new Date();
  if (promo.startAt && promo.startAt > now) {
    throw new Error('Promo has not started yet');
  }
  if (promo.endAt && promo.endAt < now) {
    throw new Error('Promo has expired');
  }

  // Check usage limit
  if (promo.usageLimit && promo.usageCount >= promo.usageLimit) {
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
    redemptionId: redemption.id,
    customerId,
    deviceId,
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



