/**
 * Configure Program Tool
 * Create or update a loyalty program
 */

import { PrismaClient } from '@prisma/client';
import type { ConfigureProgramInput, ConfigureProgramOutput } from './types.js';
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
 * Configure a loyalty program
 * Creates a new program or updates an existing one
 */
export const configureProgram = async (
  input: ConfigureProgramInput,
  ctx?: EngineContext
): Promise<ConfigureProgramOutput> => {
  const { tenantId, storeId, programId, expiresAt, ...rest } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();

  let program;

  if (programId) {
    // Update existing program
    program = await db.loyaltyProgram.update({
      where: { id: programId },
      data: {
        ...rest,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
  } else {
    // Create new program
    program = await db.loyaltyProgram.create({
      data: {
        tenantId,
        storeId,
        ...rest,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
  }

  // Emit event
  await events.emit(LOYALTY_EVENTS.PROGRAM_CONFIGURED, {
    tenantId,
    storeId,
    programId: program.id,
  });

  return {
    ok: true,
    data: {
      programId: program.id,
    },
  };
};


