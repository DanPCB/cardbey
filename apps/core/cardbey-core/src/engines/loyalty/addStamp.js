/**
 * Add Stamp Tool
 * Increment customer's stamp count
 */

import { PrismaClient } from '@prisma/client';
import { getEventEmitter, LOYALTY_EVENTS } from './events.js';

const prisma = new PrismaClient();

/**
 * Add a stamp to customer's loyalty card
 * Creates stamp record if it doesn't exist, or increments count
 */
export const addStamp = async (input, ctx) => {
  const { tenantId, storeId, customerId, programId } = input;

  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();

  // Find existing stamp record
  const existing = await db.loyaltyProgramStamp.findFirst({
    where: {
      tenantId,
      storeId,
      programId,
      customerId,
    },
  });

  let stamp;
  if (existing) {
    // Update existing record
    stamp = await db.loyaltyProgramStamp.update({
      where: { id: existing.id },
      data: {
        count: {
          increment: 1,
        },
      },
    });
  } else {
    // Create new record
    stamp = await db.loyaltyProgramStamp.create({
      data: {
        tenantId,
        storeId,
        programId,
        customerId,
        count: 1,
      },
    });
  }

  // Emit event
  await events.emit(LOYALTY_EVENTS.STAMP_ADDED, {
    tenantId,
    storeId,
    programId,
    customerId,
    data: { count: stamp.count },
  });

  return {
    ok: true,
    data: {
      newCount: stamp.count,
    },
  };
};



