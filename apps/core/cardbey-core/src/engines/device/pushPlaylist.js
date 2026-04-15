/**
 * Push Playlist Tool
 * Send playlist to device
 */

import { PrismaClient } from '@prisma/client';
import { getEventEmitter, DEVICE_EVENTS } from './events.js';

const prisma = new PrismaClient();

/**
 * Push playlist to device
 * Creates or updates playlist binding and sends playlist data
 */
export const pushPlaylist = async (input, ctx) => {
  const { tenantId, storeId, deviceId, playlistId, playlistData, version } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();
  const deviceService = ctx?.services?.devices;

  // Create or update playlist binding
  const binding = await db.devicePlaylistBinding.upsert({
    where: {
      deviceId_playlistId: {
        deviceId,
        playlistId,
      },
    },
    update: {
      version,
      lastPushedAt: new Date(),
      status: 'pending',
    },
    create: {
      deviceId,
      playlistId,
      version,
      status: 'pending',
    },
  });

  // Push playlist to device via device service
  if (deviceService) {
    try {
      await deviceService.pushPlaylist(deviceId, {
        playlistId,
        version,
        ...playlistData,
      });
    } catch (error) {
      // Update binding status to failed
      await db.devicePlaylistBinding.update({
        where: { id: binding.id },
        data: { status: 'failed' },
      });
      throw error;
    }
  } else {
    // Fallback: Log that playlist would be pushed
    console.log(`[Device Engine] Would push playlist ${playlistId} to device ${deviceId}`);
  }

  // Emit playlist assigned event (will be broadcast to SSE)
  await events.emit(DEVICE_EVENTS.PLAYLIST_READY, {
    deviceId,
    playlistId,
  });

  return {
    ok: true,
    data: {
      bindingId: binding.id,
      status: binding.status,
    },
  };
};



