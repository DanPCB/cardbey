/**
 * Shared implementation for dashboard-initiated playlist push (same behavior as
 * POST /api/device/push-playlist): load SIGNAGE playlist, push via engine, logs, SSE.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { pushPlaylist } from '../engines/device/index.js';
import { getEventEmitter } from '../engines/device/events.js';
import { addDeviceLog } from '../engines/device/logs.js';
import { broadcastSse } from '../realtime/simpleSse.js';

function createEngineContext() {
  const prisma = getPrismaClient();
  return {
    services: {
      db: prisma,
      events: getEventEmitter(),
    },
  };
}

/**
 * @param {{ deviceId: string, playlistId: string, userId?: string | null }} args
 * @returns {Promise<{ ok: boolean, data?: { bindingId: string, status: string } }>}
 */
export async function runDashboardPlaylistPush({ deviceId, playlistId, userId = null }) {
  const prisma = getPrismaClient();

  const device = await prisma.device.findUnique({
    where: { id: deviceId },
  });

  if (!device) {
    const err = new Error('Device not found');
    err.code = 'DEVICE_NOT_FOUND';
    throw err;
  }

  const playlist = await prisma.playlist.findFirst({
    where: {
      id: playlistId,
      type: 'SIGNAGE',
    },
    include: {
      items: {
        orderBy: { orderIndex: 'asc' },
        include: {
          asset: true,
        },
      },
    },
  });

  if (!playlist) {
    const err = new Error('Playlist not found');
    err.code = 'PLAYLIST_NOT_FOUND';
    throw err;
  }

  const playlistData = {
    items: playlist.items.map((item, index) => ({
      assetId: item.assetId,
      url: item.asset?.url || '',
      type: item.asset?.type || 'image',
      duration: item.durationS ?? item.asset?.durationS ?? 5,
      order: item.orderIndex ?? index,
    })),
  };

  const version = `${playlistId}:${Date.now()}`;

  const result = await pushPlaylist(
    {
      tenantId: device.tenantId,
      storeId: device.storeId,
      deviceId,
      playlistId,
      playlistData,
      version,
    },
    createEngineContext(),
  );

  await addDeviceLog({
    deviceId,
    source: 'playlist',
    level: 'info',
    message: 'Playlist assigned',
    payload: { playlistId },
  });

  try {
    const { logPlaylistAssigned } = await import('./activityEventService.js');
    await logPlaylistAssigned({
      deviceId,
      playlistId,
      tenantId: device.tenantId,
      storeId: device.storeId,
      userId: userId || undefined,
      metadata: {
        version,
      },
    });
  } catch (logError) {
    console.warn('[dashboardPlaylistPushService] activity log (non-fatal):', logError?.message || logError);
  }

  broadcastSse('admin', 'device:playlistAssigned', {
    deviceId,
    playlistId,
    at: new Date().toISOString(),
  });

  return result;
}
