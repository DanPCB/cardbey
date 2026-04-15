/**
 * Create Playlist Tool
 * Create a new SIGNAGE playlist
 */

import { PrismaClient } from '@prisma/client';
import { getEventEmitter, SIGNAGE_EVENTS } from './events.ts';
import type { CreatePlaylistInput, CreatePlaylistOutput } from './types.ts';

const prisma = new PrismaClient();

/**
 * Engine context interface
 */
export interface EngineContext {
  services?: {
    db?: PrismaClient;
    events?: ReturnType<typeof getEventEmitter>;
    [key: string]: unknown;
  };
  /** Set by performer / tool dispatcher when logging activity for playlist push */
  userId?: string | null;
  [key: string]: unknown;
}

/**
 * Create a SIGNAGE playlist
 * 
 * @param input - Playlist creation parameters
 * @param ctx - Execution context with services
 * @returns Created playlist result
 */
export const createPlaylist = async (
  input: CreatePlaylistInput,
  ctx?: EngineContext
): Promise<CreatePlaylistOutput> => {
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

