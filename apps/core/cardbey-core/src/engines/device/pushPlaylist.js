/**
 * Push Playlist Tool
 * Send playlist to device
 */

import { getEventEmitter, DEVICE_EVENTS } from './events.js';

import { prisma } from '../../lib/prisma.js';

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

  console.log('[PLAYLIST_ASSIGN_DB_WRITE]', {
    deviceId,
    playlistId,
    tenantId,
    storeId,
    bindingId: binding.id,
    status: binding.status,
    version: binding.version,
    lastPushedAt: binding.lastPushedAt,
  });

  // Push playlist to device via device service (optional realtime channel).
  // Do NOT mark binding failed on soft push errors — Device V2 TVs poll
  // GET /api/device/:id/playlist/full and must still see the assignment.
  if (deviceService) {
    try {
      await deviceService.pushPlaylist(deviceId, {
        playlistId,
        version,
        ...playlistData,
      });
    } catch (error) {
      console.warn(
        `[Device Engine] Realtime pushPlaylist failed (binding kept pending): ${error?.message || error}`,
      );
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



