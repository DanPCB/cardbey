/**
 * Configure Promo Tool
 * Create or update a promo rule
 */

import { PrismaClient } from '@prisma/client';
import { getEventEmitter, PROMO_EVENTS } from './events.js';

const prisma = new PrismaClient();

/**
 * Configure a promo rule
 * Creates a new promo or updates an existing one
 */
export const configurePromo = async (input, ctx) => {
  const { tenantId, storeId, promoId, startAt, endAt, ...rest } = input;

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



