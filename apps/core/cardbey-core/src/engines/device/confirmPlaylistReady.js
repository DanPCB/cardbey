/**
 * Confirm Playlist Ready Tool - Canonical Contract
 * Device confirms playlist is ready and playing
 */

import { PrismaClient } from '@prisma/client';
import { getEventEmitter, DEVICE_EVENTS } from './events.js';

const prisma = new PrismaClient();

/**
 * Confirm playlist ready
 * Updates binding status to ready or failed
 * 
 * @param {object} input - ConfirmPlaylistReadyInput
 * @param {object} ctx - Execution context
 * @returns {Promise<object>} ConfirmPlaylistReadyOutput
 */
export const confirmPlaylistReady = async (input, ctx) => {
  const { deviceId, playlistId, playlistVersion, status } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();

  // Find device
  const device = await db.device.findFirst({
    where: { id: deviceId },
  });

  if (!device) {
    throw new Error('Device not found');
  }

  // Normalize version to string (backend stores as string)
  const versionStr = typeof playlistVersion === 'number' 
    ? playlistVersion.toString() 
    : (playlistVersion?.toString() || '1');

  // Find binding by deviceId and playlistId (version is optional for matching)
  // First try exact match with version
  let binding = await db.devicePlaylistBinding.findFirst({
    where: {
      deviceId,
      playlistId,
      version: versionStr,
    },
  });
  
  // If no exact match, find latest binding for this device+playlist
  if (!binding) {
    binding = await db.devicePlaylistBinding.findFirst({
      where: {
        deviceId,
        playlistId,
      },
      orderBy: {
        lastPushedAt: 'desc',
      },
    });
  }

  if (!binding) {
    // Create binding if it doesn't exist
    binding = await db.devicePlaylistBinding.create({
      data: {
        deviceId,
        playlistId,
        version: versionStr,
        status: status === 'ready' ? 'ready' : 'failed',
      },
    });
  } else {
    // Update binding status and version if provided
    binding = await db.devicePlaylistBinding.update({
      where: { id: binding.id },
      data: {
        status: status === 'ready' ? 'ready' : 'failed',
        ...(versionStr && { version: versionStr }), // Update version if provided
      },
    });
  }

  // Emit event
  await events.emit(DEVICE_EVENTS.PLAYLIST_READY, {
    tenantId: device.tenantId,
    storeId: device.storeId,
    deviceId,
    playlistId,
    version: versionStr,
    status,
  });
  
  // Broadcast SSE event for dashboard
  const { broadcastSse } = await import('../../realtime/simpleSse.js');
  broadcastSse(
    'admin',
    'device:playlistReady',
    {
      deviceId,
      playlistId,
      version: versionStr,
      status,
      at: new Date().toISOString(),
    }
  );

  return {
    ok: true,
  };
};
