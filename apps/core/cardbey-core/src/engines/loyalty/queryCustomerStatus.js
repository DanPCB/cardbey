/**
 * Query Customer Status Tool
 * Get customer's stamp count and reward eligibility
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Query customer loyalty status
 * Returns stamp count, required stamps, and eligibility
 */
export const queryCustomerStatus = async (input, ctx) => {
  const { tenantId, storeId, customerId, programId } = input;

  const db = ctx?.services?.db || prisma;

  // Find customer's stamp record
  const stamp = await db.loyaltyProgramStamp.findFirst({
    where: {
      tenantId,
      storeId,
      customerId,
      programId,
    },
  });

  // Get program details
  const program = await db.loyaltyProgram.findFirst({
    where: {
      id: programId,
    },
  });

  if (!program) {
    throw new Error(`Loyalty program not found: ${programId}`);
  }

  const count = stamp?.count || 0;
  const rewardPending = stamp?.rewarded ?? false;
  const rewardEligible = count >= program.stampsRequired && !rewardPending;

  return {
    ok: true,
    data: {
      count,
      stampsRequired: program.stampsRequired,
      rewardPending,
      rewardEligible,
    },
  };
};



