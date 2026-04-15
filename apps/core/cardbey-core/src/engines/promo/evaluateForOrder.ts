/**
 * Evaluate For Order Tool
 * Find best applicable promos for an order (for future POS integration)
 */

import { PrismaClient } from '@prisma/client';
import type { EvaluateForOrderInput, EvaluateForOrderOutput } from './types.ts';
import type { EngineContext } from './configurePromo.ts';

const prisma = new PrismaClient();

/**
 * Evaluate promos for an order
 * Finds applicable promos based on order items and calculates discount amounts
 * Simple v1 implementation - can be enhanced later
 * 
 * @param input - Order evaluation parameters
 * @param ctx - Execution context with services
 * @returns Applicable promos with calculated discounts
 */
export const evaluateForOrder = async (
  input: EvaluateForOrderInput,
  ctx?: EngineContext
): Promise<EvaluateForOrderOutput> => {
  const { tenantId, storeId, orderItems } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;

  const now = new Date();

  // Get all active promos for the store
  const activePromos = await db.promoRule.findMany({
    where: {
      tenantId,
      storeId,
      active: true,
      OR: [
        { startAt: null, endAt: null },
        { startAt: { lte: now }, endAt: null },
        { startAt: null, endAt: { gte: now } },
        { startAt: { lte: now }, endAt: { gte: now } },
      ],
    },
  });

  // Filter by usage limits
  const availablePromos = activePromos.filter(
    (promo) => promo.usageLimit === null || promo.usageCount < promo.usageLimit
  );

  const applicablePromos: Array<{
    promoId: string;
    name: string;
    type: string;
    discountValue: number;
    discountAmount: number;
  }> = [];

  // Calculate total order amount
  const totalAmount = orderItems.reduce((sum, item) => sum + item.amount, 0);

  // Evaluate each promo
  for (const promo of availablePromos) {
    let isApplicable = false;
    let applicableAmount = 0;

    // Check if promo applies to this order
    if (promo.targetType === 'cart') {
      // Cart-wide promo applies to entire order
      isApplicable = true;
      applicableAmount = totalAmount;
    } else if (promo.targetType === 'item') {
      // Item-specific promo
      const matchingItem = orderItems.find((item) => item.itemId === promo.targetId);
      if (matchingItem) {
        isApplicable = true;
        applicableAmount = matchingItem.amount;
      }
    } else if (promo.targetType === 'category') {
      // Category-specific promo
      const matchingItems = orderItems.filter((item) => item.categoryId === promo.targetId);
      if (matchingItems.length > 0) {
        isApplicable = true;
        applicableAmount = matchingItems.reduce((sum, item) => sum + item.amount, 0);
      }
    }

    if (isApplicable) {
      // Calculate discount amount
      let discountAmount = 0;
      if (promo.type === 'percentage') {
        discountAmount = (applicableAmount * promo.value) / 100;
      } else if (promo.type === 'fixed') {
        discountAmount = Math.min(promo.value, applicableAmount);
      } else if (promo.type === 'bogo') {
        // Buy one get one - simple implementation
        discountAmount = applicableAmount * 0.5; // 50% off for BOGO
      } else if (promo.type === 'free_item') {
        // Free item - discount equals item value
        discountAmount = applicableAmount;
      }

      applicablePromos.push({
        promoId: promo.id,
        name: promo.name,
        type: promo.type,
        discountValue: promo.value,
        discountAmount,
      });
    }
  }

  // Sort by discount amount (highest first)
  applicablePromos.sort((a, b) => b.discountAmount - a.discountAmount);

  return {
    ok: true,
    data: {
      applicablePromos,
    },
  };
};



