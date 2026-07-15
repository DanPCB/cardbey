/**
 * Shared implementation for dashboard-initiated playlist push (same behavior as
 * POST /api/device/push-playlist): load SIGNAGE/MEDIA playlist, push via engine, logs, SSE.
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

function resolveItemPlaybackUrl(item) {
  const assetUrl = item.asset?.url;
  if (assetUrl && String(assetUrl).trim()) return String(assetUrl).trim();
  const mediaUrl = item.media?.url;
  if (mediaUrl && String(mediaUrl).trim()) return String(mediaUrl).trim();
  return '';
}

function resolveItemType(item) {
  if (item.asset?.type) return String(item.asset.type).toLowerCase();
  const kind = String(item.media?.kind || '').toLowerCase();
  if (kind === 'video') return 'video';
  if (kind === 'image' || kind === 'img') return 'image';
  if (item.mediaId) return 'image';
  return 'image';
}

/**
 * @param {{ deviceId: string, playlistId: string, userId?: string | null }} args
 * @returns {Promise<{ ok: boolean, data?: { bindingId: string, status: string } }>}
 */
export async function runDashboardPlaylistPush({ deviceId, playlistId, userId = null }) {
  const prisma = getPrismaClient();

  let device = await prisma.device.findUnique({
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

  let playlist = await prisma.playlist.findFirst({
    where: {
      id: playlistId,
      type: { in: ['SIGNAGE', 'MEDIA'] },
    },
    include: {
      items: {
        orderBy: { orderIndex: 'asc' },
        include: {
          asset: true,
          media: true,
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

  // Align tenant to store owner when store already matches — prevents blank assign after repair.
  const business = await prisma.business.findUnique({
    where: { id: device.storeId },
    select: { userId: true },
  });
  const ownerUserId = business?.userId ? String(business.userId).trim() : null;
  if (ownerUserId) {
    const { repairSignagePlaylistTenantForStore } = await import('../lib/playlistScope.js');
    await repairSignagePlaylistTenantForStore(prisma, device.storeId, ownerUserId);

    if (device.tenantId !== ownerUserId && device.tenantId !== 'temp') {
      try {
        device = await prisma.device.update({
          where: { id: device.id },
          data: { tenantId: ownerUserId },
        });
        console.log('[PLAYLIST_ASSIGN] aligned device tenantId to store owner', {
          deviceId,
          ownerUserId,
        });
      } catch (alignErr) {
        console.warn('[PLAYLIST_ASSIGN] device tenant align failed (non-fatal):', alignErr?.message);
      }
    }

    const refreshed = await prisma.playlist.findFirst({
      where: { id: playlistId, type: { in: ['SIGNAGE', 'MEDIA'] } },
      include: {
        items: { orderBy: { orderIndex: 'asc' }, include: { asset: true, media: true } },
      },
    });
    if (refreshed) playlist = refreshed;
  }

  if (playlist.tenantId !== device.tenantId || playlist.storeId !== device.storeId) {
    // Final soft allow: same store + playlist tenant is store owner
    const sameStore = playlist.storeId === device.storeId;
    const playlistOwned =
      !ownerUserId || !playlist.tenantId || playlist.tenantId === ownerUserId;
    if (!(sameStore && playlistOwned)) {
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
  }

  // Promote MEDIA → SIGNAGE when assigned to a TV so future list/filter stay consistent
  if (String(playlist.type).toUpperCase() === 'MEDIA') {
    try {
      playlist = await prisma.playlist.update({
        where: { id: playlist.id },
        data: {
          type: 'SIGNAGE',
          tenantId: ownerUserId || playlist.tenantId || device.tenantId,
          storeId: device.storeId,
          active: true,
        },
        include: {
          items: { orderBy: { orderIndex: 'asc' }, include: { asset: true, media: true } },
        },
      });
      console.log('[PLAYLIST_ASSIGN] promoted MEDIA playlist to SIGNAGE', { playlistId });
    } catch (promoteErr) {
      console.warn('[PLAYLIST_ASSIGN] MEDIA→SIGNAGE promote failed (continuing):', promoteErr?.message);
    }
  }

  const playlistData = {
    items: playlist.items
      .map((item, index) => {
        const url = resolveItemPlaybackUrl(item);
        return {
          assetId: item.assetId || item.mediaId || null,
          url,
          type: resolveItemType(item),
          duration: item.durationS ?? item.asset?.durationS ?? item.media?.durationS ?? 5,
          order: item.orderIndex ?? index,
        };
      })
      .filter((item) => Boolean(item.url)),
  };

  if (playlist.items.length > 0 && playlistData.items.length === 0) {
    const err = new Error(
      'Playlist has items but no playable media URLs. Open the playlist editor and re-add your videos/images.',
    );
    err.code = 'PLAYLIST_EMPTY_URLS';
    console.error('[PLAYLIST_ASSIGN_FAILED]', { deviceId, playlistId, error: 'PLAYLIST_EMPTY_URLS' });
    throw err;
  }

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
    itemsWithUrl: playlistData.items.length,
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
