/**
 * Query Device Playlist Tool
 * Get current playlist for a device
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Query device playlist
 * Returns the playlist currently assigned to a device
 */
export const queryDevicePlaylist = async (input, ctx) => {
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

  return {
    ok: true,
    data: {
      playlistId: schedule.playlist.id,
      playlistName: schedule.playlist.name,
      items: schedule.playlist.items.map((item) => ({
        assetId: item.assetId,
        url: item.asset.url,
        type: item.asset.type,
        duration: item.durationS || item.asset.duration, // Use unified field name
        order: item.orderIndex, // Use unified field name
      })),
    },
  };
};

