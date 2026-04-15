/**
 * Query Active Promos Tool
 * Get active promotions for a store
 */

import { PrismaClient } from '@prisma/client';
import type { QueryActivePromosInput, QueryActivePromosOutput } from './types.ts';
import type { EngineContext } from './configurePromo.ts';

const prisma = new PrismaClient();

/**
 * Query active promos
 * Filters by tenantId, storeId, active=true, and current date within [startAt, endAt]
 * Optionally filters by targetItemId or targetCategoryId
 * 
 * @param input - Query parameters
 * @param ctx - Execution context with services
 * @returns List of active promos
 */
export const queryActivePromos = async (
  input: QueryActivePromosInput,
  ctx?: EngineContext
): Promise<QueryActivePromosOutput> => {
  const { tenantId, storeId, targetItemId, targetCategoryId } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;

  const now = new Date();

  // Build where clause
  const where: {
    tenantId: string;
    storeId: string;
    active: boolean;
    OR: Array<{
      startAt: null | { lte: Date };
      endAt: null | { gte: Date };
    }>;
    AND?: Array<{
      OR?: Array<{
        startAt: null | { lte: Date };
        endAt: null | { gte: Date };
      }>;
    }>;
    targetType?: string;
    targetId?: string | null;
  } = {
    tenantId,
    storeId,
    active: true,
    OR: [
      // No date restrictions
      { startAt: null, endAt: null },
      // Start in past, no end
      { startAt: { lte: now }, endAt: null },
      // No start, end in future
      { startAt: null, endAt: { gte: now } },
      // Both set, current date in range
      { startAt: { lte: now }, endAt: { gte: now } },
    ],
  };

  // Filter by target if provided
  if (targetItemId) {
    where.targetType = 'item';
    where.targetId = targetItemId;
  } else if (targetCategoryId) {
    where.targetType = 'category';
    where.targetId = targetCategoryId;
  }

  const promos = await db.promoRule.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Filter by usage limit (if set)
  const activePromos = promos.filter((promo) => {
    if (promo.usageLimit !== null && promo.usageCount >= promo.usageLimit) {
      return false;
    }
    return true;
  });

  return {
    ok: true,
    data: {
      promos: activePromos.map((promo) => ({
        id: promo.id,
        name: promo.name,
        type: promo.type,
        targetType: promo.targetType,
        targetId: promo.targetId,
        value: promo.value,
        startAt: promo.startAt ? promo.startAt.toISOString() : null,
        endAt: promo.endAt ? promo.endAt.toISOString() : null,
        usageLimit: promo.usageLimit,
        usageCount: promo.usageCount,
        active: promo.active,
      })),
    },
  };
};
