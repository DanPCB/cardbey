/**
 * Query Active Promos Tool
 * Get currently active promos for a store
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Query active promos
 * Returns promos that are currently active based on dates and active flag
 */
export const queryActivePromos = async (input, ctx) => {
  const { tenantId, storeId, targetItemId, targetCategoryId } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;

  const now = new Date();

  // Build where clause
  const where = {
    tenantId,
    storeId,
    active: true,
    OR: [
      { startAt: null },
      { startAt: { lte: now } },
    ],
    AND: [
      {
        OR: [
          { endAt: null },
          { endAt: { gte: now } },
        ],
      },
    ],
  };

  // Filter by target if provided
  if (targetItemId) {
    where.AND.push({
      OR: [
        { targetType: 'item', targetId: targetItemId },
        { targetType: 'cart' },
      ],
    });
  } else if (targetCategoryId) {
    where.AND.push({
      OR: [
        { targetType: 'category', targetId: targetCategoryId },
        { targetType: 'cart' },
      ],
    });
  }

  // Query promos
  const promos = await db.promoRule.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return {
    ok: true,
    data: {
      promos: promos.map((promo) => ({
        id: promo.id,
        name: promo.name,
        type: promo.type,
        targetType: promo.targetType,
        targetId: promo.targetId,
        value: promo.value,
        startAt: promo.startAt?.toISOString() || null,
        endAt: promo.endAt?.toISOString() || null,
        usageLimit: promo.usageLimit,
        usageCount: promo.usageCount,
        active: promo.active,
      })),
    },
  };
};



