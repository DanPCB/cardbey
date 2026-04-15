/**
 * Push Playlist Tool
 * Send playlist to device via WebSocket/SSE channel
 */

import { PrismaClient } from '@prisma/client';
import type { PushPlaylistInput, PushPlaylistOutput } from './types.ts';
import { getEventEmitter, DEVICE_EVENTS } from './events.js';
import type { EngineContext } from './requestPairing.ts';

const prisma = new PrismaClient();

/**
 * Push playlist to device
 * Creates or updates playlist binding and sends playlist data
 */
export const pushPlaylist = async (
  input: PushPlaylistInput,
  ctx?: EngineContext
): Promise<PushPlaylistOutput> => {
  const { tenantId, storeId, deviceId, playlistId, playlistData, version } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();
  const deviceService = ctx?.services?.devices;

  // Create or update playlist binding (status="pending")
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

  // Enqueue message to device channel (WebSocket/SSE) with playlist JSON
  const playlistJson = {
    playlistId,
    version,
    ...playlistData,
  };

  if (deviceService && deviceService.pushPlaylist) {
    try {
      await deviceService.pushPlaylist(deviceId, playlistJson);
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
    // In production, this would enqueue to device channel
    console.log(`[Device Engine] Would push playlist to device ${deviceId}:`, JSON.stringify(playlistJson, null, 2));
  }

  return {
    ok: true,
    data: {
      bindingId: binding.id,
      status: binding.status,
    },
  };
};

