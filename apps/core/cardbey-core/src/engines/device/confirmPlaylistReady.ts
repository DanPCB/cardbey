/**
 * Confirm Playlist Ready Tool
 * Device confirms playlist is ready and playing
 */

import { PrismaClient } from '@prisma/client';
import type { ConfirmPlaylistReadyInput, ConfirmPlaylistReadyOutput } from './types.ts';
import { getEventEmitter, DEVICE_EVENTS } from './events.js';
import type { EngineContext } from './requestPairing.ts';

const prisma = new PrismaClient();

/**
 * Confirm playlist ready
 * Updates binding status to ready
 */
export const confirmPlaylistReady = async (
  input: ConfirmPlaylistReadyInput,
  ctx?: EngineContext
): Promise<ConfirmPlaylistReadyOutput> => {
  const { tenantId, storeId, deviceId, playlistId, version } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();

  // Find binding
  const binding = await db.devicePlaylistBinding.findFirst({
    where: {
      deviceId,
      playlistId,
      version,
    },
  });

  if (!binding) {
    throw new Error('Playlist binding not found');
  }

  // Update binding status to "ready"
  await db.devicePlaylistBinding.update({
    where: { id: binding.id },
    data: {
      status: 'ready',
    },
  });

  // Emit event
  await events.emit(DEVICE_EVENTS.PLAYLIST_READY, {
    tenantId,
    storeId,
    deviceId,
    playlistId,
    version,
  });

  return {
    ok: true,
    data: {
      status: 'ready',
    },
  };
};

