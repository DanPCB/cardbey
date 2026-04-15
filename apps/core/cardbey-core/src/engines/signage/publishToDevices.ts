/**
 * Publish to Devices Tool
 * - Explicit mode: push a SIGNAGE playlist to deviceIds or all non-archived devices (same path as POST /api/device/push-playlist).
 * - Schedule mode (legacy): push from PlaylistSchedule when no deviceIds / pushToAll.
 */

import { PrismaClient } from '@prisma/client';
import type { PublishToDevicesInput, PublishToDevicesOutput } from './types.ts';
import { getEventEmitter, SIGNAGE_EVENTS } from './events.ts';
import { callTool } from '../../orchestrator/runtime/toolExecutor.js';
import type { EngineContext } from './createPlaylist.ts';
import { runDashboardPlaylistPush } from '../../services/dashboardPlaylistPushService.js';

const prisma = new PrismaClient();

type CtxWithUser = EngineContext & { userId?: string | null };

/**
 * Publish playlists to devices
 */
export const publishToDevices = async (
  input: PublishToDevicesInput,
  ctx?: EngineContext,
): Promise<PublishToDevicesOutput> => {
  const { tenantId, storeId, playlistId, deviceIds, pushToAll } = input;

  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();
  const userId = (ctx as CtxWithUser)?.userId ?? null;

  const explicit =
    pushToAll === true || (Array.isArray(deviceIds) && deviceIds.length > 0);

  if (explicit) {
    const pid = playlistId != null ? String(playlistId).trim() : '';
    if (!pid) {
      return {
        ok: false,
        data: {
          mode: 'explicit',
          pushed: 0,
          failed: 0,
          devices: [],
          playlistId: '',
          playlistName: '',
        },
      };
    }

    const playlistMeta = await db.playlist.findFirst({
      where: {
        id: pid,
        tenantId,
        storeId,
        type: 'SIGNAGE',
        active: true,
      },
      select: { id: true, name: true },
    });

    if (!playlistMeta) {
      return {
        ok: false,
        data: {
          mode: 'explicit',
          pushed: 0,
          failed: 0,
          devices: [],
          playlistId: pid,
          playlistName: '',
        },
      };
    }

    let targetIds: string[] = [];
    if (pushToAll === true) {
      const all = await db.device.findMany({
        // Device.archivedAt is not present; omit it to avoid Prisma validation errors.
        where: { tenantId, storeId },
        select: { id: true },
      });
      targetIds = all.map((x) => x.id);
    } else if (deviceIds?.length) {
      targetIds = [...new Set(deviceIds.map((id) => String(id).trim()).filter(Boolean))];
    }

    const playlistName = playlistMeta.name?.trim() || pid;
    const devicesOut: Array<{
      deviceId: string;
      name: string;
      location: string;
      ok: boolean;
      error?: string;
    }> = [];

    let pushed = 0;
    let failed = 0;

    for (const deviceId of targetIds) {
      const dev = await db.device.findFirst({
        // Device.archivedAt is not present; omit it to avoid Prisma validation errors.
        where: { id: deviceId, tenantId, storeId },
      });
      if (!dev) {
        failed += 1;
        devicesOut.push({
          deviceId,
          name: deviceId.slice(0, 8),
          location: '',
          ok: false,
          error: 'Device not found or not in this store',
        });
        continue;
      }
      try {
        await runDashboardPlaylistPush({
          deviceId,
          playlistId: pid,
          userId,
        });
        pushed += 1;
        devicesOut.push({
          deviceId,
          name: dev.name?.trim() || deviceId.slice(0, 8),
          location: dev.location?.trim() || '',
          ok: true,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        failed += 1;
        devicesOut.push({
          deviceId,
          name: dev.name?.trim() || deviceId.slice(0, 8),
          location: dev.location?.trim() || '',
          ok: false,
          error: msg,
        });
      }
    }

    await events.emit(SIGNAGE_EVENTS.PUBLISHED, {
      tenantId,
      storeId,
      playlistId: pid,
      devicesUpdated: pushed,
      mode: 'explicit',
    });

    return {
      ok: true,
      data: {
        mode: 'explicit',
        pushed,
        failed,
        devices: devicesOut,
        playlistId: pid,
        playlistName,
      },
    };
  }

  // ── Legacy: schedule-based publish ─────────────────────────────
  const playlists = await db.playlist.findMany({
    where: {
      tenantId,
      storeId,
      type: 'SIGNAGE',
      active: true,
      ...(playlistId ? { id: playlistId } : {}),
    },
    include: {
      items: {
        include: {
          asset: true,
        },
        orderBy: { orderIndex: 'asc' },
      },
      schedules: true,
    },
  });

  let devicesUpdated = 0;

  for (const playlist of playlists) {
    const playlistData = {
      items: playlist.items.map((item) => ({
        assetId: item.assetId || '',
        url: item.asset?.url || '',
        type: item.asset?.type || 'image',
        duration: item.durationS || item.asset?.durationS || 8,
        order: item.orderIndex,
      })),
    };

    const version = `${playlist.id}-${Date.now()}`;

    const now = new Date();
    const dayOfWeek = now.getDay();

    for (const schedule of playlist.schedules) {
      let isActive = true;

      if (schedule.startAt && schedule.startAt > now) {
        isActive = false;
      }
      if (schedule.endAt && schedule.endAt < now) {
        isActive = false;
      }

      if (schedule.daysOfWeek && isActive) {
        const days = schedule.daysOfWeek.split(',').map((d) => parseInt(d.trim(), 10));
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

      if (!isActive) {
        continue;
      }

      if (schedule.deviceId) {
        const pushResult = await callTool(
          'device.push-playlist',
          {
            tenantId,
            storeId,
            deviceId: schedule.deviceId,
            playlistId: playlist.id,
            playlistData,
            version,
          },
          ctx,
        );

        if (pushResult.ok) {
          devicesUpdated++;
        }
      } else if (schedule.deviceGroupId) {
        console.log(`[Signage] Would push playlist to device group ${schedule.deviceGroupId}`);
      }
    }
  }

  await events.emit(SIGNAGE_EVENTS.PUBLISHED, {
    tenantId,
    storeId,
    playlistId: playlistId || null,
    devicesUpdated,
    mode: 'schedule',
  });

  return {
    ok: true,
    data: {
      mode: 'schedule',
      devicesUpdated,
    },
  };
};
