/**
 * Create Playlist Tool
 * Create a new playlist
 */

import { PrismaClient } from '@prisma/client';
import { getEventEmitter, SIGNAGE_EVENTS } from './events.js';

const prisma = new PrismaClient();

/**
 * Create a playlist
 */
export const createPlaylist = async (input, ctx) => {
  const { tenantId, storeId, name, description } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();

  // Create playlist with SIGNAGE type
  const playlist = await db.playlist.create({
    data: {
      type: 'SIGNAGE',
      tenantId,
      storeId,
      name,
      description: description || null,
      active: true,
    },
  });

  // Emit event
  await events.emit(SIGNAGE_EVENTS.PLAYLIST_CREATED, {
    tenantId,
    storeId,
    playlistId: playlist.id,
  });

  return {
    ok: true,
    data: {
      playlistId: playlist.id,
    },
  };
};

