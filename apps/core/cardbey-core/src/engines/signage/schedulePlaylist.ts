/**
 * Schedule Playlist Tool
 * Schedule a playlist to devices with time-based rules
 */

import { PrismaClient } from '@prisma/client';
import { getEventEmitter, SIGNAGE_EVENTS } from './events.ts';
import type { SchedulePlaylistInput, SchedulePlaylistOutput } from './types.ts';
import type { EngineContext } from './createPlaylist.ts';

const prisma = new PrismaClient();

/**
 * Schedule a playlist
 * Creates a schedule for a playlist on specific devices or device groups
 * 
 * @param input - Schedule parameters (device, time range, days, etc.)
 * @param ctx - Execution context with services
 * @returns Created schedule result
 */
export const schedulePlaylist = async (
  input: SchedulePlaylistInput,
  ctx?: EngineContext
): Promise<SchedulePlaylistOutput> => {
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

