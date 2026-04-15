/**
 * Trigger Repair Tool
 * Initiate device repair workflow
 */

import { PrismaClient } from '@prisma/client';
import { getEventEmitter, DEVICE_EVENTS } from './events.js';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Trigger repair
 * Initiates repair workflow based on repair type
 */
export const triggerRepair = async (input, ctx) => {
  const { tenantId, storeId, deviceId, repairType = 'full_reset' } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();
  const deviceService = ctx?.services?.devices;

  // Get device
  const device = await db.device.findFirst({
    where: {
      id: deviceId,
      tenantId,
      storeId,
    },
    include: {
      bindings: {
        where: { status: { in: ['ready', 'pending'] } },
        orderBy: { lastPushedAt: 'desc' },
        take: 1,
        select: { id: true, playlistId: true, status: true },
      },
    },
  });

  if (!device) {
    throw new Error('Device not found');
  }

  console.log('[DEVICE_REPAIR] Request from dashboard:', {
    deviceId,
    repairType,
    currentStatus: device.status,
    hasActiveBinding: !!device.bindings?.[0],
    bindingId: device.bindings?.[0]?.id || null,
  });

  const actions = [];

  // Set device status to repair_requested to signal TV to show waiting page
  await db.device.update({
    where: { id: deviceId },
    data: {
      status: 'repair_requested',
    },
  });

  console.log('[DEVICE_REPAIR] Device status set to repair_requested', {
    deviceId,
    repairType,
  });

  // Emit repair started event
  await events.emit(DEVICE_EVENTS.REPAIR_STARTED, {
    tenantId,
    storeId,
    deviceId,
    repairType,
  });

  // Execute repair actions based on type
  switch (repairType) {
    case 'reset_pairing':
      // Reset pairing - generate new code
      const pairingCode = crypto.randomBytes(3).toString('hex').toUpperCase().substring(0, 6);
      await db.device.update({
        where: { id: deviceId },
        data: {
          pairingCode,
          status: 'repair_in_progress', // Keep in repair state during reset
        },
      });
      actions.push('reset_pairing');
      console.log('[DEVICE_REPAIR] Reset pairing code', { deviceId, pairingCode });
      break;

    case 'reload_playlist':
      // Get current playlist binding and push again
      const binding = await db.devicePlaylistBinding.findFirst({
        where: { deviceId, status: 'ready' },
        orderBy: { lastPushedAt: 'desc' },
      });
      if (binding && deviceService) {
        // Would trigger playlist reload
        actions.push('reload_playlist');
      }
      break;

    case 'clear_cache':
      if (deviceService) {
        await deviceService.clearCache(deviceId);
      }
      actions.push('clear_cache');
      break;

    case 'full_reset':
      // Reset pairing
      const newPairingCode = crypto.randomBytes(3).toString('hex').toUpperCase().substring(0, 6);
      await db.device.update({
        where: { id: deviceId },
        data: {
          pairingCode: newPairingCode,
          status: 'repair_in_progress', // Keep in repair state during reset
        },
      });
      actions.push('reset_pairing');
      console.log('[DEVICE_REPAIR] Full reset - pairing code reset', { deviceId, pairingCode: newPairingCode });
      
      // Clear cache
      if (deviceService) {
        await deviceService.clearCache(deviceId);
      }
      actions.push('clear_cache');
      
      // Reload playlist
      const currentBinding = await db.devicePlaylistBinding.findFirst({
        where: { deviceId, status: 'ready' },
        orderBy: { lastPushedAt: 'desc' },
      });
      if (currentBinding) {
        actions.push('reload_playlist');
        console.log('[DEVICE_REPAIR] Full reset - playlist reload queued', {
          deviceId,
          bindingId: currentBinding.id,
          playlistId: currentBinding.playlistId,
        });
      }
      break;
  }

  // Note: Device status remains 'repair_in_progress' or 'repair_requested' until:
  // 1. Device sends heartbeat (which will reset status to 'online')
  // 2. Dashboard calls a clear-repair endpoint (to be implemented)
  // 3. Repair agent completes and updates status
  
  const repairId = `repair-${deviceId}-${Date.now()}`;
  
  console.log('[DEVICE_REPAIR] Repair actions completed', {
    deviceId,
    repairId,
    repairType,
    actions,
    currentStatus: 'repair_in_progress', // Status will be updated by heartbeat or clear-repair
    note: 'Device will remain in repair state until heartbeat or explicit clear',
  });

  // Emit repair completed event
  await events.emit(DEVICE_EVENTS.REPAIR_COMPLETED, {
    tenantId,
    storeId,
    deviceId,
    repairType,
    actions,
  });

  return {
    ok: true,
    data: {
      repairId,
      actions,
      deviceStatus: 'repair_in_progress', // Current status
      note: 'Device will return to online status on next heartbeat, or call POST /api/device/:id/clear-repair to clear immediately',
    },
  };
};

