/**
 * Redeem Reward Tool
 * Record reward redemption for a customer
 */

import { PrismaClient } from '@prisma/client';
import type { RedeemRewardInput, RedeemRewardOutput } from './types.js';
import { getEventEmitter, LOYALTY_EVENTS } from './events.js';

const prisma = new PrismaClient();

/**
 * Context interface for engine tools
 */
interface EngineContext {
  services: {
    db: PrismaClient;
    events: ReturnType<typeof getEventEmitter>;
  };
}

/**
 * Redeem a reward for a customer
 * Creates a reward record and marks stamp as rewarded
 */
export const redeemReward = async (
  input: RedeemRewardInput,
  ctx?: EngineContext
): Promise<RedeemRewardOutput> => {
  const { tenantId, storeId, customerId, programId } = input;

  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();

  // Get program to retrieve reward details
  const program = await db.loyaltyProgram.findFirst({
    where: {
      id: programId,
    },
  });

  if (!program) {
    throw new Error(`Loyalty program not found: ${programId}`);
  }

  // Verify customer has enough stamps
  const stamp = await db.loyaltyProgramStamp.findFirst({
    where: {
      tenantId,
      storeId,
      customerId,
      programId,
    },
  });

  if (!stamp) {
    throw new Error('Customer stamp record not found');
  }

  if (stamp.count < program.stampsRequired) {
    throw new Error(
      `Not enough stamps. Required: ${program.stampsRequired}, Current: ${stamp.count}`
    );
  }

  if (stamp.rewarded) {
    throw new Error('Reward already redeemed');
  }

  // Create reward record
  await db.loyaltyReward.create({
    data: {
      tenantId,
      storeId,
      programId,
      customerId,
      reward: program.reward,
    },
  });

  // Mark stamp as rewarded
  await db.loyaltyProgramStamp.update({
    where: {
      id: stamp.id,
    },
    data: {
      rewarded: true,
    },
  });

  // Emit event
  await events.emit(LOYALTY_EVENTS.REWARD_REDEEMED, {
    tenantId,
    storeId,
    programId,
    customerId,
  });

  return {
    ok: true,
    data: {
      reward: program.reward,
      redeemedAt: new Date().toISOString(),
    },
  };
};


