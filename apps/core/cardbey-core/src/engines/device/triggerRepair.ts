/**
 * Trigger Repair Tool
 * Initiate device repair workflow
 */

import { PrismaClient } from '@prisma/client';
import type { TriggerRepairInput, TriggerRepairOutput } from './types.ts';
import { getEventEmitter, DEVICE_EVENTS } from './events.js';
import type { EngineContext } from './requestPairing.ts';

const prisma = new PrismaClient();

/**
 * Trigger repair
 * Marks device as degraded and emits repair started event
 */
export const triggerRepair = async (
  input: TriggerRepairInput,
  ctx?: EngineContext
): Promise<TriggerRepairOutput> => {
  const { tenantId, storeId, deviceId } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();

  // Get device
  const device = await db.device.findFirst({
    where: {
      id: deviceId,
      tenantId,
      storeId,
    },
  });

  if (!device) {
    throw new Error('Device not found');
  }

  // Mark device status as "degraded"
  await db.device.update({
    where: { id: deviceId },
    data: {
      status: 'degraded',
    },
  });

  // Emit repair started event
  await events.emit(DEVICE_EVENTS.REPAIR_STARTED, {
    tenantId,
    storeId,
    deviceId,
    repairType: input.repairType || null,
  });

  // For now, only record the event
  // Later, the Repair Agent will react to this event
  const repairId = `repair-${deviceId}-${Date.now()}`;

  return {
    ok: true,
    data: {
      repairId,
      actions: [], // Empty for now, Repair Agent will populate
    },
  };
};

