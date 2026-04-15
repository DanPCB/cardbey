/**
 * Request Pairing Tool
 * Generate pairing code for device
 */

import { PrismaClient } from '@prisma/client';
import { getEventEmitter, DEVICE_EVENTS } from './events.js';
import type { RequestPairingInput, RequestPairingOutput } from './types.ts';
import { inferDeviceType } from './deviceType.js';
import crypto from 'crypto';

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
 * Generate a unique pairing code
 * Returns short numeric/alphanumeric code (6 characters)
 */
function generatePairingCode(): string {
  // Generate 6-character alphanumeric code
  return crypto.randomBytes(3).toString('hex').toUpperCase().substring(0, 6);
}

/**
 * Request pairing
 * Creates a device record with a pairing code
 * tenantId and storeId can be provisional/unknown during initial pairing
 * 
 * @param input - Pairing request parameters
 * @param ctx - Execution context with services
 * @returns Pairing code and device ID
 */
export const requestPairing = async (
  input: RequestPairingInput,
  ctx?: EngineContext
): Promise<RequestPairingOutput> => {
  const { tenantId, storeId, model, name, location } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();

  // Generate unique pairing code
  let pairingCode: string;
  let attempts = 0;
  do {
    pairingCode = generatePairingCode();
    const existing = await db.device.findUnique({
      where: { pairingCode },
    });
    if (!existing) break;
    attempts++;
    if (attempts > 10) {
      throw new Error('Failed to generate unique pairing code');
    }
  } while (true);

  // Create device (tenantId/storeId can be provisional)
  const device = await db.device.create({
    data: {
      tenantId: tenantId || 'provisional', // Provisional if not provided
      storeId: storeId || 'provisional', // Provisional if not provided
      pairingCode,
      model: model || null,
      name: name || null,
      location: location || null,
      status: 'offline',
    },
  });

  // Emit event
  await events.emit(DEVICE_EVENTS.PAIRED, {
    tenantId: tenantId || 'provisional',
    storeId: storeId || 'provisional',
    deviceId: device.id,
    pairingCode,
  });

  return {
    ok: true,
    data: {
      deviceId: device.id,
      pairingCode,
    },
  };
};
