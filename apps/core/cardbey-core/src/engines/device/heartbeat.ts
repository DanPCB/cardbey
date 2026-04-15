/**
 * Heartbeat Tool
 * Update device status and state snapshot
 */

import { PrismaClient } from '@prisma/client';
import type { HeartbeatInput, HeartbeatOutput } from './types.ts';
import { getEventEmitter, DEVICE_EVENTS } from './events.js';
import type { EngineContext } from './requestPairing.ts';

const prisma = new PrismaClient();

const HEARTBEAT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Process heartbeat
 * Updates device status, last seen, and creates state snapshot
 * Emits events for offline/degraded states
 * 
 * @param input - Heartbeat data from device
 * @param ctx - Execution context with services
 * @returns Updated device status
 */
export const heartbeat = async (
  input: HeartbeatInput,
  ctx?: EngineContext
): Promise<HeartbeatOutput> => {
  const { tenantId, storeId, deviceId, status: inputStatus, appVersion, playlistVersion, storageFreeMb, wifiStrength, errorCodes, capabilities } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();

  // Get current device to check last seen
  const currentDevice = await db.device.findUnique({
    where: { id: deviceId },
  });

  if (!currentDevice) {
    throw new Error('Device not found');
  }

  const now = new Date();
  const wasOffline = currentDevice.lastSeenAt 
    ? (now.getTime() - currentDevice.lastSeenAt.getTime()) > HEARTBEAT_THRESHOLD_MS
    : true;

  // Determine status (use input status or infer from errors)
  let status = inputStatus || 'online';
  if (errorCodes && errorCodes.length > 0) {
    status = 'degraded';
  }

  // Update device
  const device = await db.device.update({
    where: { id: deviceId },
    data: {
      status,
      lastSeenAt: now,
      appVersion: appVersion || undefined,
    },
  });

  // Update or create capabilities
  if (capabilities) {
    await db.deviceCapability.upsert({
      where: { deviceId },
      update: {
        capabilities: capabilities as Record<string, boolean>,
      },
      create: {
        deviceId,
        capabilities: capabilities as Record<string, boolean>,
      },
    });
  }

  // Create state snapshot with new schema fields
  await db.deviceStateSnapshot.create({
    data: {
      deviceId,
      playlistVersion: playlistVersion || null,
      storageFreeMb: storageFreeMb || null,
      wifiStrength: wifiStrength || null,
      errorCodes: errorCodes && errorCodes.length > 0 
        ? errorCodes.join(',') // Store as comma-separated string
        : null,
    },
  });

  // Emit heartbeat event
  await events.emit(DEVICE_EVENTS.HEARTBEAT_RECEIVED, {
    tenantId,
    storeId,
    deviceId,
    status: device.status,
  });

  // Emit offline detected if device was offline and now came back
  if (wasOffline && status === 'online') {
    await events.emit(DEVICE_EVENTS.OFFLINE_DETECTED, {
      tenantId,
      storeId,
      deviceId,
      message: 'Device was offline and is now back online',
    });
  }

  // Emit degraded if status indicates issues
  if (status === 'degraded') {
    await events.emit(DEVICE_EVENTS.OFFLINE_DETECTED, {
      tenantId,
      storeId,
      deviceId,
      status: 'degraded',
      errorCodes,
    });
  }

  return {
    ok: true,
    data: {
      status: device.status,
    },
  };
};
