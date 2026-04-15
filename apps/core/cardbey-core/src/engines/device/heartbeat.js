/**
 * Heartbeat Tool - Canonical Contract
 * Device heartbeat with full playback state, metrics, and command execution
 */

import { PrismaClient } from '@prisma/client';
import { getEventEmitter, DEVICE_EVENTS } from './events.js';
import { getPendingCommands, markCommandsExecuted } from './commandQueue.js';
import { getPlaylistForDevice } from '../../services/deviceService.js';
import { buildMediaUrl } from '../../utils/publicUrl.js';

const prisma = new PrismaClient();

/**
 * Process heartbeat
 * Updates device status, records metrics, and returns commands + playlist
 * 
 * @param {object} input - HeartbeatInput
 * @param {object} ctx - Execution context
 * @returns {Promise<object>} HeartbeatOutput
 * @throws {Error} If device not found (will be caught by route handler)
 */
export const heartbeat = async (input, ctx) => {
  const {
    deviceId,
    status,
    playbackState,
    metrics,
    errorCode,
    errorMessage,
    platform,
    appVersion,
    ip,
    executedCommands,
  } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();

  // Find device using findUnique (as per requirements)
  console.log('[Heartbeat] deviceId:', deviceId, 'found:', false); // Log before lookup
  const device = await db.device.findUnique({
    where: { id: deviceId },
  });

  console.log('[Heartbeat] deviceId:', deviceId, 'found:', !!device); // Log after lookup

  if (!device) {
    // Return error object instead of throwing (route handler will convert to 404)
    const error = new Error('Device not found');
    error.statusCode = 404;
    error.errorCode = 'device_not_found';
    throw error;
  }

  // Check if device is paired (has tenantId and storeId, and pairingCode is null)
  const isPaired = device.tenantId && 
                   device.storeId && 
                   device.tenantId !== 'temp' && 
                   device.storeId !== 'temp' &&
                   !device.pairingCode;

  // Update device status - always set to 'online' when heartbeat is received
  // This ensures devices sending heartbeats are marked as online
  const deviceStatus = 'online'; // Always online when heartbeat is received
  const now = new Date();
  await db.device.update({
    where: { id: deviceId },
    data: {
      status: deviceStatus,
      lastSeenAt: now, // Use lastSeenAt, not lastSeen
      appVersion: appVersion || undefined,
      platform: platform || undefined, // Also update platform if provided
    },
  });

  // Emit device status changed event (will be broadcast to SSE)
  await events.emit(DEVICE_EVENTS.HEARTBEAT_RECEIVED, {
    deviceId,
    status: deviceStatus,
    lastSeenAt: now.toISOString(),
  });

  // Update capabilities if platform/appVersion changed
  if (platform || appVersion) {
    const existingCap = await db.deviceCapability.findUnique({
      where: { deviceId },
    });

    if (existingCap) {
      await db.deviceCapability.update({
        where: { deviceId },
        data: {
          capabilities: {
            ...existingCap.capabilities,
            platform,
            appVersion,
          },
        },
      });
    }
  }

  // Create state snapshot
  const errorCodes = errorCode ? [errorCode] : null;
  await db.deviceStateSnapshot.create({
    data: {
      deviceId,
      playlistVersion: playbackState?.playlistVersion?.toString() || null,
      storageFreeMb: metrics?.storageFreeMb || null,
      wifiStrength: metrics?.wifiStrength || null,
      errorCodes: errorCodes ? errorCodes.join(',') : null,
    },
  });

  // Mark executed commands as done
  if (executedCommands && executedCommands.length > 0) {
    const executedIds = executedCommands
      .filter((cmd) => cmd.status === 'done')
      .map((cmd) => cmd.id);
    
    if (executedIds.length > 0) {
      await markCommandsExecuted(deviceId, executedIds);
    }
  }

  // Get pending commands
  const pendingCommands = await getPendingCommands(deviceId);

  // Get playlist if device is paired
  let playlist = null;
  let playlistLock = null;

  if (isPaired) {
    try {
      // Get assigned playlist for device
      const playlistData = await getPlaylistForDevice(deviceId);
      
      if (playlistData && playlistData.items && playlistData.items.length > 0) {
        // Check if there's a playlist lock (critical campaign)
        // For now, we'll use a simple approach: if playlist has a specific tag or name pattern
        const isLocked = playlistData.name?.toLowerCase().includes('critical') || 
                        playlistData.name?.toLowerCase().includes('campaign');
        
        playlistLock = {
          locked: isLocked,
          playlistId: isLocked ? playlistData.id : undefined,
        };

        // Extract version number from version string (format: "playlistId:timestamp")
        const versionMatch = playlistData.version?.match(/:(\d+)$/);
        const versionNumber = versionMatch ? parseInt(versionMatch[1], 10) : 1;

        // Convert playlist to canonical format
        playlist = {
          id: playlistData.id,
          version: versionNumber,
          name: playlistData.name || 'Untitled Playlist',
          items: playlistData.items
            .filter((item) => item && item.url) // Filter out invalid items
            .map((item, index) => {
              // Build media URL - normalize old absolute URLs to use current server origin
              // Note: heartbeat function doesn't have req object, so buildMediaUrl will use
              // PUBLIC_API_BASE_URL env var or fallback to localhost
              let itemUrl = item.url;
              if (itemUrl) {
                // Create a minimal request-like object for buildMediaUrl
                // It will use env vars or fallback, but won't have the actual request origin
                // This is acceptable since heartbeat is typically called from internal contexts
                const mockReq = ctx?.req || null; // Use req from context if available
                itemUrl = buildMediaUrl(itemUrl, mockReq);
              }

              return {
                id: item.id || `item_${index}`,
                type: item.type === 'video' ? 'video' : 'image',
                url: itemUrl,
                durationSeconds: item.duration || item.durationS || 8,
                transition: 'fade',
                meta: {
                  fitMode: 'cover',
                  muted: true,
                  loop: false,
                },
              };
            }),
        };
      }
    } catch (error) {
      console.error('[Device Engine] Error fetching playlist:', error);
      // Continue without playlist
    }
  }

  // Emit event
  await events.emit(DEVICE_EVENTS.HEARTBEAT_RECEIVED, {
    tenantId: device.tenantId,
    storeId: device.storeId,
    deviceId,
    status: deviceStatus,
    isPaired,
  });

  // Build response
  const response = {
    ok: true,
    paired: isPaired,
    status: deviceStatus,
    commands: pendingCommands.length > 0 ? pendingCommands.map((cmd) => ({
      id: cmd.id,
      type: cmd.type,
      payload: cmd.payload || {},
    })) : undefined,
    playlistLock: playlistLock || { locked: false },
    playlist: playlist || undefined,
    nextHeartbeatInSeconds: 30,
  };

  // Remove undefined fields
  if (!response.commands || response.commands.length === 0) {
    delete response.commands;
  }
  if (!response.playlist) {
    delete response.playlist;
  }

  return response;
};
