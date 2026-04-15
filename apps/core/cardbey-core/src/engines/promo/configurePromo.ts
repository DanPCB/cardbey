/**
 * Configure Promo Tool
 * Create or update a promo rule
 */

import { PrismaClient } from '@prisma/client';
import { getEventEmitter, PROMO_EVENTS } from './events.ts';
import type { ConfigurePromoInput, ConfigurePromoOutput } from './types.ts';

const prisma = new PrismaClient();

/**
 * Engine context interface
 */
export interface EngineContext {
  services?: {
    db?: PrismaClient;
    events?: ReturnType<typeof getEventEmitter>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Configure a promo rule
 * Creates a new promo or updates an existing one
 * 
 * @param input - Promo configuration parameters
 * @param ctx - Execution context with services
 * @returns Created/updated promo ID
 */
export const configurePromo = async (
  input: ConfigurePromoInput,
  ctx?: EngineContext
): Promise<ConfigurePromoOutput> => {
  const { tenantId, storeId, promoId, startAt, endAt, active, ...rest } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();

  let promo;

  if (promoId) {
    // Update existing promo
    promo = await db.promoRule.update({
      where: { id: promoId },
      data: {
        ...rest,
        active: active !== undefined ? active : undefined,
        startAt: startAt ? new Date(startAt) : null,
        endAt: endAt ? new Date(endAt) : null,
      },
    });
  } else {
    // Create new promo
    promo = await db.promoRule.create({
      data: {
        tenantId,
        storeId,
        ...rest,
        active: active !== undefined ? active : true,
        startAt: startAt ? new Date(startAt) : null,
        endAt: endAt ? new Date(endAt) : null,
      },
    });
  }

  // Emit event
  await events.emit(PROMO_EVENTS.PROMO_CONFIGURED, {
    tenantId,
    storeId,
    promoId: promo.id,
  });

  return {
    ok: true,
    data: {
      promoId: promo.id,
    },
  };
};
