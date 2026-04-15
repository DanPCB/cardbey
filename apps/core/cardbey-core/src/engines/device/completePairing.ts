/**
 * Complete Pairing Tool
 * Complete device pairing process
 */

import { PrismaClient } from '@prisma/client';
import { getEventEmitter, DEVICE_EVENTS } from './events.js';
import type { CompletePairingInput, CompletePairingOutput } from './types.ts';
import type { EngineContext } from './requestPairing.ts';
import { inferDeviceType } from './deviceType.js';

const prisma = new PrismaClient();

/**
 * Complete pairing
 * Confirms pairing and updates device with tenantId/storeId
 * 
 * @param input - Pairing completion parameters
 * @param ctx - Execution context with services
 * @returns Device ID and status
 */
export const completePairing = async (
  input: CompletePairingInput,
  ctx?: EngineContext
): Promise<CompletePairingOutput> => {
  const { tenantId, storeId, pairingCode, deviceId, name, location, model } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();

  // Find device by pairing code or deviceId
  const where = deviceId
    ? { id: deviceId }
    : { pairingCode };

  const device = await db.device.findFirst({
    where,
    include: {
      capabilities: true, // Include capabilities to get platform
    },
  });

  if (!device) {
    throw new Error('Device not found or pairing code invalid');
  }

  // Get platform from device.platform or from capabilities JSON
  const platform = device.platform || 
    (device.capabilities?.capabilities as any)?.platform || 
    null;

  // Preserve existing type if set, otherwise infer from platform
  const deviceType = device.type || inferDeviceType(platform);

  // Update device with tenantId/storeId and set status to online
  const updated = await db.device.update({
    where: { id: device.id },
    data: {
      tenantId,
      storeId,
      status: 'online',
      lastSeenAt: new Date(),
      pairingCode: null, // Clear pairing code after successful pairing
      type: deviceType, // Preserve or set device type
      platform: platform || device.platform, // Ensure platform is set
      ...(name !== undefined && { name }),
      ...(location !== undefined && { location }),
      ...(model !== undefined && { model }),
    },
  });

  // Emit event
  await events.emit(DEVICE_EVENTS.PAIRED, {
    tenantId,
    storeId,
    deviceId: updated.id,
    status: updated.status,
  });

  return {
    ok: true,
    data: {
      deviceId: updated.id,
      status: updated.status,
    },
  };
};
