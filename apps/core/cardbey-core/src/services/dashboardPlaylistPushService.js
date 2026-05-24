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
    console.error('[PLAYLIST_ASSIGN_FAILED]', { deviceId, playlistId, error: 'DEVICE_NOT_FOUND' });
    const err = new Error('Device not found');
    err.code = 'DEVICE_NOT_FOUND';
    throw err;
  }

  console.log('[PLAYLIST_ASSIGN_START]', {
    deviceId,
    playlistId,
    tenantId: device.tenantId,
    storeId: device.storeId,
    endpoint: 'runDashboardPlaylistPush',
  });

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
    console.error('[PLAYLIST_ASSIGN_FAILED]', { deviceId, playlistId, error: 'PLAYLIST_NOT_FOUND' });
    const err = new Error('Playlist not found');
    err.code = 'PLAYLIST_NOT_FOUND';
    throw err;
  }

  if (playlist.storeId !== device.storeId) {
    const { buildPlaylistAccessDeniedContext, logPlaylistAccessDenied } = await import(
      '../lib/playlistScope.js'
    );
    const deniedCtx = await buildPlaylistAccessDeniedContext(
      prisma,
      playlist,
      { tenantId: device.tenantId, storeId: device.storeId },
      { userId, path: 'runDashboardPlaylistPush' },
      { deviceId, sourceRoute: 'POST /api/device/push-playlist' },
    );
    logPlaylistAccessDenied(deniedCtx);
    console.error('[PLAYLIST_ASSIGN_FAILED]', {
      deviceId,
      playlistId,
      error: 'PLAYLIST_STORE_MISMATCH',
      ...deniedCtx,
    });
    const err = new Error(
      'Playlist does not belong to this device\'s store. Create or select a playlist for the same store as the device.',
    );
    err.code = 'PLAYLIST_STORE_MISMATCH';
    throw err;
  }

  if (playlist.tenantId !== device.tenantId) {
    const { repairSignagePlaylistTenantForStore } = await import('../lib/playlistScope.js');
    const business = await prisma.business.findUnique({
      where: { id: device.storeId },
      select: { userId: true },
    });
    const ownerUserId = business?.userId ? String(business.userId).trim() : device.tenantId;
    if (ownerUserId) {
      await repairSignagePlaylistTenantForStore(prisma, device.storeId, ownerUserId);
      const repaired = await prisma.playlist.findFirst({
        where: { id: playlistId, type: 'SIGNAGE' },
        include: {
          items: { orderBy: { orderIndex: 'asc' }, include: { asset: true } },
        },
      });
      if (repaired && repaired.tenantId === device.tenantId) {
        Object.assign(playlist, repaired);
      }
    }
  }

  if (playlist.tenantId !== device.tenantId || playlist.storeId !== device.storeId) {
    const { buildPlaylistAccessDeniedContext, logPlaylistAccessDenied } = await import(
      '../lib/playlistScope.js'
    );
    const deniedCtx = await buildPlaylistAccessDeniedContext(
      prisma,
      playlist,
      { tenantId: device.tenantId, storeId: device.storeId },
      { userId, path: 'runDashboardPlaylistPush' },
      { deviceId, sourceRoute: 'POST /api/device/push-playlist' },
    );
    logPlaylistAccessDenied(deniedCtx);
    console.error('[PLAYLIST_ASSIGN_FAILED]', {
      deviceId,
      playlistId,
      error: 'PLAYLIST_STORE_MISMATCH',
      ...deniedCtx,
    });
    const err = new Error(
      'Playlist does not belong to this device\'s store. Create or select a playlist for the same store as the device.',
    );
    err.code = 'PLAYLIST_STORE_MISMATCH';
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

  const bindingStatus = result?.data?.status ?? 'pending';

  broadcastSse('admin', 'device:playlistAssigned', {
    deviceId,
    playlistId,
    bindingStatus,
    status: bindingStatus,
    tenantId: device.tenantId,
    storeId: device.storeId,
    at: new Date().toISOString(),
  });

  broadcastSse('admin', 'device:update', {
    deviceId,
    playlistId,
    bindingStatus,
    tenantId: device.tenantId,
    storeId: device.storeId,
    at: new Date().toISOString(),
  });

  const canonical = {
    playlistId: playlist.id,
    playlistName: playlist.name,
    tenantId: device.tenantId,
    storeId: device.storeId,
    bindingId: result?.data?.bindingId ?? result?.bindingId,
    bindingStatus: result?.data?.status ?? result?.status,
  };

  console.log('[PLAYLIST_ASSIGN_SUCCESS]', {
    deviceId,
    ...canonical,
    playlistItemCount: playlist.items?.length ?? 0,
    itemsWithAsset: playlist.items?.filter((i) => i.assetId && i.asset?.url).length ?? 0,
  });

  try {
    const { enqueueDeviceCommand } = await import('../engines/device/commands.js');
    await enqueueDeviceCommand(deviceId, 'reloadPlaylist', { reason: 'dashboard_assign' });
    console.log('[TV_AUTO_PLAY_TRIGGER]', {
      deviceId,
      playlistId,
      command: 'reloadPlaylist',
      source: 'dashboard_assign',
    });
  } catch (cmdErr) {
    console.warn('[TV_AUTO_PLAY_TRIGGER] reloadPlaylist queue failed (non-fatal):', cmdErr?.message || cmdErr);
  }

  return {
    ok: true,
    data: canonical,
  };
}
