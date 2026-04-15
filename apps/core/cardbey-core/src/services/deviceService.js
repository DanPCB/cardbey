/**
 * Device Service Layer
 * Orchestrates pairing, heartbeat, playlist linkage, and remote commands
 * Abstracts DB away from controllers
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { normalizePublicOrigin } from '../utils/publicUrl.js';

const prisma = new PrismaClient();

/**
 * Device status types
 * @typedef {'unpaired' | 'paired' | 'online' | 'offline' | 'degraded'} DeviceStatus
 */

/**
 * Register or pair device input
 * @typedef {Object} RegisterDeviceInput
 * @property {string} [pairingCode] - Optional pairing code for pairing flow
 * @property {'android_tv' | 'tablet' | 'web' | 'other'} [platform] - Device platform
 * @property {string} [tenantId] - Tenant ID (optional for initial registration)
 * @property {string} [storeId] - Store ID (optional for initial registration)
 * @property {Record<string, any>} [metadata] - Additional device metadata
 */

/**
 * Register or pair device result
 * @typedef {Object} RegisterDeviceResult
 * @property {string} deviceId - Device ID
 * @property {DeviceStatus} status - Device status
 * @property {string} [pairingCode] - Pairing code (if unpaired)
 * @property {Object} [config] - Device configuration
 * @property {string} config.streamBaseUrl - WebSocket base URL
 * @property {string} config.apiBaseUrl - API base URL
 */

/**
 * Heartbeat input
 * @typedef {Object} HeartbeatInput
 * @property {string} deviceId - Device ID
 * @property {DeviceStatus} [status] - Current device status
 * @property {Record<string, any>} [info] - Additional device info
 */

/**
 * Playlist update input
 * @typedef {Object} PlaylistUpdateInput
 * @property {string} deviceId - Device ID
 * @property {string} playlistId - Playlist ID to attach
 */

/**
 * Command payload
 * @typedef {Object} CommandPayload
 * @property {'reload_playlist' | 'restart' | 'custom'} type - Command type
 * @property {any} [payload] - Optional command payload
 */

/**
 * Generate a unique pairing code
 */
function generatePairingCode() {
  // Generate 6-character alphanumeric code
  return crypto.randomBytes(3).toString('hex').toUpperCase().substring(0, 6);
}

/**
 * Get stream base URL from environment
 */
function getStreamBaseUrl() {
  const protocol = process.env.NODE_ENV === 'production' && process.env.HTTPS_ENABLED === 'true'
    ? 'wss'
    : 'ws';
  const host = process.env.STREAM_BASE_URL || process.env.PUBLIC_API_BASE || 'localhost:3001';
  // Remove http:// or https:// if present
  const cleanHost = host.replace(/^https?:\/\//, '');
  return normalizePublicOrigin(`${protocol}://${cleanHost}`);
}

/**
 * Get API base URL from environment
 */
function getApiBaseUrl() {
  const protocol = process.env.NODE_ENV === 'production' && process.env.HTTPS_ENABLED === 'true'
    ? 'https'
    : 'http';
  const host = process.env.PUBLIC_API_BASE || 'localhost:3001';
  const cleanHost = host.replace(/^https?:\/\//, '');
  return normalizePublicOrigin(`${protocol}://${cleanHost}`);
}

/**
 * Register or pair a device
 * 
 * @param {RegisterDeviceInput} input - Registration input
 * @returns {Promise<RegisterDeviceResult>} Registration result
 */
export async function registerOrPairDevice(input) {
  const { pairingCode, platform, tenantId, storeId, metadata } = input;

  console.log('[DeviceService] registerOrPairDevice', {
    hasPairingCode: !!pairingCode,
    platform,
    tenantId,
    storeId,
  });

  let device;
  let status = 'unpaired';

  if (pairingCode) {
    // Try to find existing device with this pairing code
    device = await prisma.device.findUnique({
      where: { pairingCode },
    });

    if (device) {
      // Complete pairing
      if (tenantId && storeId) {
        device = await prisma.device.update({
          where: { id: device.id },
          data: {
            tenantId,
            storeId,
            status: 'online',
            lastSeenAt: new Date(),
            pairingCode: null, // Clear pairing code after successful pairing
            appVersion: metadata?.appVersion || device.appVersion,
            model: metadata?.model || device.model,
            location: metadata?.location || device.location,
          },
        });
        status = 'paired';
        console.log('[DeviceService] Device paired', { deviceId: device.id });
      } else {
        // Pairing code found but no tenantId/storeId - keep as unpaired
        status = 'unpaired';
      }
    } else {
      // Pairing code not found - create new device
      const newPairingCode = generatePairingCode();
      device = await prisma.device.create({
        data: {
          tenantId: tenantId || 'temp',
          storeId: storeId || 'temp',
          pairingCode: newPairingCode,
          status: 'offline',
          model: metadata?.model || null,
          location: metadata?.location || null,
          appVersion: metadata?.appVersion || null,
        },
      });
      status = 'unpaired';
      console.log('[DeviceService] New device created with pairing code', {
        deviceId: device.id,
        pairingCode: newPairingCode,
      });
    }
  } else {
    // No pairing code - create new unpaired device
    const newPairingCode = generatePairingCode();
    device = await prisma.device.create({
      data: {
        tenantId: tenantId || 'temp',
        storeId: storeId || 'temp',
        pairingCode: newPairingCode,
        status: 'offline',
        model: metadata?.model || null,
        location: metadata?.location || null,
        appVersion: metadata?.appVersion || null,
      },
    });
    status = 'unpaired';
    console.log('[DeviceService] New device created', {
      deviceId: device.id,
      pairingCode: newPairingCode,
    });
  }

  return {
    deviceId: device.id,
    status,
    pairingCode: device.pairingCode || undefined,
    config: {
      streamBaseUrl: getStreamBaseUrl(),
      apiBaseUrl: getApiBaseUrl(),
    },
  };
}

/**
 * Record device heartbeat
 * 
 * @param {HeartbeatInput} input - Heartbeat input
 * @returns {Promise<void>}
 */
export async function recordHeartbeat(input) {
  const { deviceId, status, info } = input;

  console.log('[DeviceService] recordHeartbeat', { deviceId, status });

  const updateData = {
    lastSeenAt: new Date(),
    ...(status && { status }),
  };

  const updated = await prisma.device.updateMany({
    where: { id: deviceId },
    data: updateData,
  });

  if (updated.count === 0) {
    console.warn('[DeviceService] recordHeartbeat: no device row; skipping (avoid client re-pair loop)', {
      deviceId,
    });
    return;
  }

  // Also create a snapshot if info is provided
  if (info) {
    await prisma.deviceStateSnapshot.create({
      data: {
        deviceId,
        playlistVersion: info.playlistVersion || null,
        storageFreeMb: info.storageFreeMb || null,
        wifiStrength: info.wifiStrength || null,
        errorCodes: info.errorCodes ? (Array.isArray(info.errorCodes) ? info.errorCodes.join(',') : info.errorCodes) : null,
      },
    });
  }

  console.log('[DeviceService] Heartbeat recorded', { deviceId });
}

/**
 * Attach playlist to device
 * 
 * @param {PlaylistUpdateInput} input - Playlist update input
 * @returns {Promise<void>}
 */
export async function attachPlaylistToDevice(input) {
  const { deviceId, playlistId } = input;

  console.log('[DeviceService] attachPlaylistToDevice', { deviceId, playlistId });

  // Get device to check tenantId/storeId
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
  });

  if (!device) {
    throw new Error(`Device not found: ${deviceId}`);
  }

  // Create or update playlist binding
  const version = `${playlistId}:${Date.now()}`;
  await prisma.devicePlaylistBinding.upsert({
    where: {
      deviceId_playlistId: {
        deviceId,
        playlistId,
      },
    },
    update: {
      version,
      lastPushedAt: new Date(),
      status: 'pending',
    },
    create: {
      deviceId,
      playlistId,
      version,
      status: 'pending',
    },
  });

  console.log('[DeviceService] Playlist attached', { deviceId, playlistId, version });
}

/**
 * Get playlist for device
 * 
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object | null>} Playlist data or null
 */
export async function getPlaylistForDevice(deviceId) {
  console.log('[DeviceService] getPlaylistForDevice', { deviceId });

  // Get device with latest playlist binding
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: {
      bindings: {
        orderBy: { lastPushedAt: 'desc' },
        take: 1,
        include: {
          // Note: Playlist relation doesn't exist in DevicePlaylistBinding
          // We'll need to fetch playlist separately
        },
      },
    },
  });

  if (!device) {
    throw new Error(`Device not found: ${deviceId}`);
  }

  const latestBinding = device.bindings[0];
  if (!latestBinding) {
    return null;
  }

  // Fetch playlist data
  const playlist = await prisma.playlist.findUnique({
    where: { id: latestBinding.playlistId },
    include: {
      items: {
        orderBy: { orderIndex: 'asc' },
        include: {
          media: true,
          asset: true,
        },
      },
    },
  });

  if (!playlist) {
    return null;
  }

  // Format playlist for device
  const playlistData = {
    id: playlist.id,
    name: playlist.name,
    version: latestBinding.version,
    items: playlist.items.map((item) => {
      // Support both MEDIA and SIGNAGE playlist types
      if (item.mediaId && item.media) {
        return {
          id: item.id,
          type: item.media.kind?.toLowerCase() || 'image',
          url: item.media.url,
          duration: item.durationS || 8,
          order: item.orderIndex,
        };
      } else if (item.assetId && item.asset) {
        return {
          id: item.id,
          type: item.asset.type,
          url: item.asset.url,
          duration: item.durationS || item.asset.durationS || 8,
          order: item.orderIndex,
        };
      }
      return null;
    }).filter(Boolean),
  };

  console.log('[DeviceService] Playlist fetched', {
    deviceId,
    playlistId: playlist.id,
    itemCount: playlistData.items.length,
  });

  return playlistData;
}

/**
 * Record a command sent to device (for auditing)
 * 
 * @param {string} deviceId - Device ID
 * @param {CommandPayload} command - Command payload
 * @returns {Promise<void>}
 */
export async function recordCommand(deviceId, command) {
  console.log('[DeviceService] recordCommand', { deviceId, commandType: command.type });

  // TODO: Store commands in a DeviceCommand table for auditing
  // For now, just log
  console.log('[DeviceService] Command recorded', {
    deviceId,
    command: command.type,
    payload: command.payload,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Find device by ID
 * 
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object | null>} Device or null
 */
export async function findById(deviceId) {
  return await prisma.device.findUnique({
    where: { id: deviceId },
    include: {
      bindings: {
        orderBy: { lastPushedAt: 'desc' },
        take: 1,
      },
      snapshots: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
}

/**
 * Find device by pairing code
 * 
 * @param {string} pairingCode - Pairing code
 * @returns {Promise<Object | null>} Device or null
 */
export async function findByPairingCode(pairingCode) {
  return await prisma.device.findUnique({
    where: { pairingCode },
  });
}

/**
 * Mark device as online
 * 
 * @param {string} deviceId - Device ID
 * @param {Record<string, any>} [data] - Optional additional data
 * @returns {Promise<void>}
 */
export async function markOnline(deviceId, data) {
  await prisma.device.update({
    where: { id: deviceId },
    data: {
      status: 'online',
      lastSeenAt: new Date(),
      ...data,
    },
  });
}

/**
 * Mark device as offline
 * 
 * @param {string} deviceId - Device ID
 * @returns {Promise<void>}
 */
export async function markOffline(deviceId) {
  await prisma.device.update({
    where: { id: deviceId },
    data: {
      status: 'offline',
      lastSeenAt: new Date(),
    },
  });
}

/**
 * Update current playlist for device
 * 
 * @param {string} deviceId - Device ID
 * @param {string} playlistId - Playlist ID
 * @returns {Promise<void>}
 */
export async function updateCurrentPlaylist(deviceId, playlistId) {
  await attachPlaylistToDevice({ deviceId, playlistId });
}


