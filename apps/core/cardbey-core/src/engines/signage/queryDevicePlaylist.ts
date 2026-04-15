/**
 * Query Device Playlist Tool
 * Get current playlist for a device
 */

import { PrismaClient } from '@prisma/client';
import type { QueryDevicePlaylistInput, QueryDevicePlaylistOutput } from './types.ts';
import type { EngineContext } from './createPlaylist.ts';

const prisma = new PrismaClient();

/**
 * Query device playlist
 * Returns the playlist currently assigned to a device based on active schedules
 * 
 * @param input - Device query parameters
 * @param ctx - Execution context with services
 * @returns Current playlist for device or empty result
 */
export const queryDevicePlaylist = async (
  input: QueryDevicePlaylistInput,
  ctx?: EngineContext
): Promise<QueryDevicePlaylistOutput> => {
  const { tenantId, storeId, deviceId } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;

  // Find active schedule for device
  const now = new Date();
  const dayOfWeek = now.getDay();

  const schedule = await db.playlistSchedule.findFirst({
    where: {
      tenantId,
      storeId,
      deviceId,
      OR: [
        { startAt: null },
        { startAt: { lte: now } },
      ],
      AND: [
        {
          OR: [
            { endAt: null },
            { endAt: { gte: now } },
          ],
        },
      ],
    },
    include: {
      playlist: {
        include: {
          items: {
            include: {
              asset: true,
            },
            orderBy: { orderIndex: 'asc' }, // Use unified field name
          },
        },
      },
    },
  });

  if (!schedule || !schedule.playlist) {
    return {
      ok: true,
      data: {
        playlistId: null,
        playlistName: null,
        items: [],
      },
    };
  }

  // Check if schedule is active based on days and time
  let isActive = true;

  if (schedule.daysOfWeek) {
    const days = schedule.daysOfWeek.split(',').map((d) => parseInt(d.trim()));
    if (!days.includes(dayOfWeek)) {
      isActive = false;
    }
  }

  if (schedule.timeRange && isActive) {
    const [startTime, endTime] = schedule.timeRange.split('-').map((t) => t.trim());
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    if (currentTime < startTime || currentTime > endTime) {
      isActive = false;
    }
  }

  if (!isActive || !schedule.playlist.active) {
    return {
      ok: true,
      data: {
        playlistId: null,
        playlistName: null,
        items: [],
      },
    };
  }

  // Query DevicePlaylistBinding for current playlist status
  const binding = await db.devicePlaylistBinding.findFirst({
    where: {
      deviceId,
      playlistId: schedule.playlist.id,
    },
    orderBy: {
      lastPushedAt: 'desc',
    },
  });

  return {
    ok: true,
    data: {
      playlistId: schedule.playlist.id,
      playlistName: schedule.playlist.name,
      version: binding?.version || null,
      status: binding?.status || null,
      items: schedule.playlist.items.map((item) => ({
        assetId: item.assetId || '',
        url: item.asset?.url || '',
        type: item.asset?.type || 'image',
        duration: item.durationS || item.asset?.durationS || 8, // Use unified field name
        order: item.orderIndex, // Use unified field name
      })),
    },
  };
};

