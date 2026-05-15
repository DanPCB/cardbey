/**
 * Schedule Playlist Tool
 * Schedule a playlist to devices
 */

import { getEventEmitter, SIGNAGE_EVENTS } from './events.js';

import { prisma } from '../../lib/prisma.js';

/**
 * Schedule a playlist
 * Creates a schedule for a playlist on specific devices or device groups
 */
export const schedulePlaylist = async (input, ctx) => {
  const { tenantId, storeId, playlistId, deviceId, deviceGroupId, startAt, endAt, daysOfWeek, timeRange } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();

  // Create schedule
  const schedule = await db.playlistSchedule.create({
    data: {
      tenantId,
      storeId,
      playlistId,
      deviceId: deviceId || null,
      deviceGroupId: deviceGroupId || null,
      startAt: startAt ? new Date(startAt) : null,
      endAt: endAt ? new Date(endAt) : null,
      daysOfWeek: daysOfWeek || null,
      timeRange: timeRange || null,
    },
  });

  // Emit event
  await events.emit(SIGNAGE_EVENTS.SCHEDULED, {
    tenantId,
    storeId,
    playlistId,
    scheduleId: schedule.id,
  });

  return {
    ok: true,
    data: {
      scheduleId: schedule.id,
    },
  };
};



