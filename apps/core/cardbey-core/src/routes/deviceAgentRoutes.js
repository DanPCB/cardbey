/**
 * Device Agent API Routes
 * REST endpoints for device registration, pairing, playlist, and remote control
 * Mirrors the Android DeviceAgent functionality
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import {
  registerOrPairDevice,
  recordHeartbeat,
  attachPlaylistToDevice,
  getPlaylistForDevice,
  recordCommand,
  findById,
} from '../services/deviceService.js';
import { getDeviceWebSocketHub } from '../realtime/deviceWebSocketHub.js';

const prisma = new PrismaClient();
const router = express.Router();

/**
 * POST /api/devices/register
 * Register or pair a device
 * 
 * Request body:
 *   - pairingCode?: string (optional, for pairing flow)
 *   - platform?: "android_tv" | "tablet" | "web" | "other"
 *   - tenantId?: string (optional for initial registration)
 *   - storeId?: string (optional for initial registration)
 *   - metadata?: object (device metadata)
 * 
 * Response:
 *   - ok: boolean
 *   - deviceId: string
 *   - status: "unpaired" | "paired" | "online" | "offline"
 *   - pairingCode?: string
 *   - config: { streamBaseUrl, apiBaseUrl }
 */
router.post('/register', async (req, res, next) => {
  try {
    const { pairingCode, platform, tenantId, storeId, metadata } = req.body;

    console.log('[DeviceAgent] POST /api/devices/register', {
      hasPairingCode: !!pairingCode,
      platform,
      tenantId,
      storeId,
    });

    const result = await registerOrPairDevice({
      pairingCode,
      platform,
      tenantId,
      storeId,
      metadata,
    });

    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error('[DeviceAgent] Register error:', error);
    next(error);
  }
});

/**
 * POST /api/devices/:deviceId/heartbeat
 * Record device heartbeat
 * 
 * Request body:
 *   - status?: "online" | "offline" | "degraded"
 *   - info?: object (device info: battery, network, playlistVersion, etc.)
 * 
 * Response:
 *   - ok: boolean
 */
router.post('/:deviceId/heartbeat', async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { status, info } = req.body;

    console.log('[DeviceAgent] POST /api/devices/:deviceId/heartbeat', {
      deviceId,
      status,
    });

    await recordHeartbeat({
      deviceId,
      status,
      info,
    });

    res.json({
      ok: true,
      message: 'Heartbeat recorded',
    });
  } catch (error) {
    console.error('[DeviceAgent] Heartbeat error:', error);
    next(error);
  }
});

/**
 * GET /api/devices/:deviceId/playlist
 * Get playlist for device
 * 
 * Response:
 *   - ok: boolean
 *   - playlist: object | null (playlist data)
 */
router.get('/:deviceId/playlist', async (req, res, next) => {
  try {
    const { deviceId } = req.params;

    console.log('[DeviceAgent] GET /api/devices/:deviceId/playlist', { deviceId });

    const playlist = await getPlaylistForDevice(deviceId);

    res.json({
      ok: true,
      playlist,
    });
  } catch (error) {
    console.error('[DeviceAgent] Get playlist error:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({
        ok: false,
        error: error.message,
      });
    }
    next(error);
  }
});

/**
 * POST /api/devices/:deviceId/commands
 * Send remote command to device (dashboard/admin)
 * 
 * Request body:
 *   - type: "reload_playlist" | "restart" | "custom"
 *   - payload?: any (optional command payload)
 * 
 * Response:
 *   - ok: boolean
 *   - sent: boolean (whether message was sent via WebSocket)
 */
router.post('/:deviceId/commands', requireAuth, async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { type, payload } = req.body;

    console.log('[DeviceAgent] POST /api/devices/:deviceId/commands', {
      deviceId,
      type,
    });

    // Validate command type
    if (!['reload_playlist', 'restart', 'custom'].includes(type)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid command type',
        message: 'Command type must be one of: reload_playlist, restart, custom',
      });
    }

    // TODO: Validate permission (admin or tenant owner)
    // For now, allow all authenticated users

    // Record command for auditing
    await recordCommand(deviceId, { type, payload });

    // Send command via WebSocket
    const hub = getDeviceWebSocketHub();
    const commandMessage = {
      type: 'command',
      command: type,
      payload,
      timestamp: Date.now(),
    };

    const sent = hub.sendToDevice(deviceId, commandMessage);

    res.json({
      ok: true,
      sent,
      message: sent ? 'Command sent to device' : 'Device not connected',
    });
  } catch (error) {
    console.error('[DeviceAgent] Command error:', error);
    next(error);
  }
});

/**
 * POST /api/devices/:deviceId/playlist/update
 * Attach playlist to device and notify via WebSocket (dashboard/admin)
 * 
 * Request body:
 *   - playlistId: string
 * 
 * Response:
 *   - ok: boolean
 */
router.post('/:deviceId/playlist/update', requireAuth, async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { playlistId } = req.body;

    console.log('[DeviceAgent] POST /api/devices/:deviceId/playlist/update', {
      deviceId,
      playlistId,
    });

    if (!playlistId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing playlistId',
        message: 'playlistId is required',
      });
    }

    // TODO: Validate permission (admin or tenant owner)

    // Attach playlist to device
    await attachPlaylistToDevice({ deviceId, playlistId });

    // Send playlist update notification via WebSocket
    const hub = getDeviceWebSocketHub();
    const updateMessage = {
      type: 'playlist_update',
      playlistId,
      timestamp: Date.now(),
    };

    const sent = hub.sendToDevice(deviceId, updateMessage);

    res.json({
      ok: true,
      sent,
      message: sent ? 'Playlist updated and notification sent' : 'Playlist updated but device not connected',
    });
  } catch (error) {
    console.error('[DeviceAgent] Playlist update error:', error);
    next(error);
  }
});

/**
 * POST /api/devices/:deviceId/assign-playlist
 * Assign playlist to device (Dashboard-initiated, requires auth)
 * 
 * Request body:
 *   - playlistId: string (required)
 * 
 * Response:
 *   - ok: boolean
 *   - deviceId: string
 *   - playlistId: string
 * 
 * Errors:
 *   - 400: Missing or invalid playlistId
 *   - 403: Device/playlist belongs to different tenant/store
 *   - 404: Device or playlist not found
 */
router.post('/:deviceId/assign-playlist', requireAuth, async (req, res, next) => {
  const requestId = Math.random().toString(36).slice(2, 9);
  
  try {
    const { deviceId } = req.params;
    const { playlistId } = req.body;
    
    console.log(`[DeviceAgent] [${requestId}] POST /api/devices/${deviceId}/assign-playlist`, {
      deviceId,
      playlistId,
    });
    
    // Validate playlistId
    if (!playlistId || typeof playlistId !== 'string' || playlistId.trim() === '') {
      return res.status(400).json({
        ok: false,
        error: 'playlistId_required',
        message: 'playlistId is required',
      });
    }
    
    // Validate deviceId
    if (!deviceId || typeof deviceId !== 'string' || deviceId.trim() === '') {
      return res.status(400).json({
        ok: false,
        error: 'deviceId_required',
        message: 'deviceId is required',
      });
    }
    
    // Verify device exists and get tenant/store context
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        tenantId: true,
        storeId: true,
        name: true,
      },
    });
    
    if (!device) {
      console.log(`[DeviceAgent] [${requestId}] Device not found: ${deviceId}`);
      return res.status(404).json({
        ok: false,
        error: 'device_not_found',
        message: 'Device not found',
      });
    }
    
    // Verify playlist exists and belongs to same tenant/store
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: {
        id: true,
        name: true,
        tenantId: true,
        storeId: true,
        type: true,
      },
    });
    
    if (!playlist) {
      console.log(`[DeviceAgent] [${requestId}] Playlist not found: ${playlistId}`);
      return res.status(404).json({
        ok: false,
        error: 'playlist_not_found',
        message: 'Playlist not found',
      });
    }
    
    // Verify tenant/store match (if both are set and not 'temp')
    if (device.tenantId !== 'temp' && device.storeId !== 'temp' &&
        playlist.tenantId && playlist.storeId) {
      if (device.tenantId !== playlist.tenantId || device.storeId !== playlist.storeId) {
        console.log(`[DeviceAgent] [${requestId}] Tenant/store mismatch:`, {
          deviceTenantId: device.tenantId,
          deviceStoreId: device.storeId,
          playlistTenantId: playlist.tenantId,
          playlistStoreId: playlist.storeId,
        });
        return res.status(403).json({
          ok: false,
          error: 'tenant_store_mismatch',
          message: 'Device and playlist must belong to the same tenant and store',
        });
      }
    }
    
    // Mark any existing active bindings as inactive (if status field exists)
    // Note: DevicePlaylistBinding doesn't have an 'active' status field,
    // but we can mark old bindings by updating their status to something else
    // For now, we'll just upsert the binding (which will update if exists)
    
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
        status: 'pending', // Will be updated to 'ready' when device confirms
      },
      create: {
        deviceId,
        playlistId,
        version,
        status: 'pending',
      },
    });
    
    console.log(`[DeviceAgent] [${requestId}] Playlist assigned to device:`, {
      deviceId,
      playlistId,
      version,
      deviceName: device.name,
      playlistName: playlist.name,
    });

    // Log activity event
    try {
      const { logPlaylistAssigned } = await import('../services/activityEventService.js');
      await logPlaylistAssigned({
        deviceId,
        playlistId,
        tenantId: device.tenantId,
        storeId: device.storeId,
        userId: req.userId,
        metadata: {
          version,
          playlistName: playlist.name,
          deviceName: device.name,
        },
      });
    } catch (logError) {
      console.warn(`[DeviceAgent] [${requestId}] Failed to log activity event (non-fatal):`, logError.message);
    }
    
    // Broadcast event for real-time updates
    try {
      const { broadcast } = await import('../realtime/sse.js');
      broadcast('device:playlistAssigned', {
        deviceId,
        playlistId,
        version,
        at: new Date().toISOString(),
      }, { key: 'admin' });
    } catch (broadcastError) {
      console.warn(`[DeviceAgent] [${requestId}] Failed to broadcast event (non-fatal):`, broadcastError.message);
    }
    
    res.json({
      ok: true,
      deviceId,
      playlistId,
    });
  } catch (error) {
    console.error(`[DeviceAgent] [${requestId}] Assign playlist error:`, {
      deviceId: req.params.deviceId,
      playlistId: req.body?.playlistId,
      error: error.message,
      stack: error.stack,
    });
    
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: 'Failed to assign playlist',
    });
  }
});

/**
 * POST /api/devices/:deviceId/assign-signage-playlist
 * Assign SignagePlaylist to device (Dashboard-initiated, requires auth)
 * Specifically for DeviceEngine v2 with SignagePlaylist (Playlist type='SIGNAGE')
 * 
 * Request body:
 *   - playlistId: string (required) - Must be a Playlist with type='SIGNAGE'
 * 
 * Response:
 *   - ok: boolean
 *   - deviceId: string
 *   - playlistId: string
 * 
 * Errors:
 *   - 400: Missing or invalid playlistId, or playlist is not SIGNAGE type
 *   - 403: Device/playlist belongs to different tenant/store
 *   - 404: Device or playlist not found
 */
router.post('/:deviceId/assign-signage-playlist', requireAuth, async (req, res, next) => {
  const requestId = Math.random().toString(36).slice(2, 9);
  
  try {
    const { deviceId } = req.params;
    const { playlistId } = req.body;
    
    console.log(`[DeviceAgent] [${requestId}] POST /api/devices/${deviceId}/assign-signage-playlist`, {
      deviceId,
      playlistId,
    });
    
    // Validate playlistId
    if (!playlistId || typeof playlistId !== 'string' || playlistId.trim() === '') {
      return res.status(400).json({
        ok: false,
        error: 'playlistId_required',
        message: 'playlistId is required',
      });
    }
    
    // Validate deviceId
    if (!deviceId || typeof deviceId !== 'string' || deviceId.trim() === '') {
      return res.status(400).json({
        ok: false,
        error: 'deviceId_required',
        message: 'deviceId is required',
      });
    }
    
    // Verify device exists and get tenant/store context
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        tenantId: true,
        storeId: true,
        name: true,
      },
    });
    
    if (!device) {
      console.log(`[DeviceAgent] [${requestId}] Device not found: ${deviceId}`);
      return res.status(404).json({
        ok: false,
        error: 'device_not_found',
        message: 'Device not found',
      });
    }
    
    // Verify SignagePlaylist exists (Playlist with type='SIGNAGE') and belongs to same tenant/store
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: {
        id: true,
        name: true,
        type: true,
        tenantId: true,
        storeId: true,
        active: true,
      },
    });
    
    if (!playlist) {
      console.log(`[DeviceAgent] [${requestId}] Playlist not found: ${playlistId}`);
      return res.status(404).json({
        ok: false,
        error: 'playlist_not_found',
        message: 'Playlist not found',
      });
    }
    
    // Verify it's a SIGNAGE playlist
    // Note: Prisma returns enum values as strings, but we need to handle both enum and string comparisons
    const playlistType = String(playlist.type).toUpperCase();
    if (playlistType !== 'SIGNAGE') {
      console.log(`[DeviceAgent] [${requestId}] Playlist is not SIGNAGE type: ${playlist.type} (normalized: ${playlistType})`);
      return res.status(400).json({
        ok: false,
        error: 'invalid_playlist_type',
        message: `Playlist must be of type SIGNAGE, got: ${playlist.type}`,
      });
    }
    
    // Verify tenant/store match (if both are set and not 'temp')
    if (device.tenantId !== 'temp' && device.storeId !== 'temp' &&
        playlist.tenantId && playlist.storeId) {
      if (device.tenantId !== playlist.tenantId || device.storeId !== playlist.storeId) {
        console.log(`[DeviceAgent] [${requestId}] Tenant/store mismatch:`, {
          deviceTenantId: device.tenantId,
          deviceStoreId: device.storeId,
          playlistTenantId: playlist.tenantId,
          playlistStoreId: playlist.storeId,
        });
        return res.status(403).json({
          ok: false,
          error: 'tenant_store_mismatch',
          message: 'Device and playlist must belong to the same tenant and store',
        });
      }
    }
    
    // Create or update playlist schedule for this device
    // First, remove any existing schedules for this device
    try {
      await prisma.playlistSchedule.deleteMany({
        where: {
          deviceId,
        },
      });
      console.log(`[DeviceAgent] [${requestId}] Deleted existing schedules for device ${deviceId}`);
    } catch (deleteError) {
      console.warn(`[DeviceAgent] [${requestId}] Error deleting existing schedules (non-fatal):`, deleteError.message);
      // Continue - this is not critical
    }
    
    // Create a new schedule (no time restrictions = always active)
    // Use device tenant/store if available, otherwise use playlist tenant/store
    const scheduleTenantId = device.tenantId && device.tenantId !== 'temp' 
      ? device.tenantId 
      : (playlist.tenantId || 'provisional');
    const scheduleStoreId = device.storeId && device.storeId !== 'temp'
      ? device.storeId
      : (playlist.storeId || 'provisional');
    
    // Validate tenantId and storeId are not null/undefined (required by schema)
    if (!scheduleTenantId || !scheduleStoreId) {
      console.error(`[DeviceAgent] [${requestId}] Invalid tenant/store for schedule creation:`, {
        deviceTenantId: device.tenantId,
        deviceStoreId: device.storeId,
        playlistTenantId: playlist.tenantId,
        playlistStoreId: playlist.storeId,
        computedTenantId: scheduleTenantId,
        computedStoreId: scheduleStoreId,
      });
      return res.status(400).json({
        ok: false,
        error: 'invalid_tenant_store',
        message: 'Device and playlist must have valid tenantId and storeId',
      });
    }
    
    let schedule;
    try {
      schedule = await prisma.playlistSchedule.create({
        data: {
          tenantId: scheduleTenantId,
          storeId: scheduleStoreId,
          playlistId,
          deviceId,
          startAt: null,
          endAt: null,
          daysOfWeek: null,
          timeRange: null,
        },
      });
      
      console.log(`[DeviceAgent] [${requestId}] Created PlaylistSchedule:`, {
        scheduleId: schedule.id,
        deviceId,
        playlistId,
        tenantId: scheduleTenantId,
        storeId: scheduleStoreId,
      });
    } catch (scheduleError) {
      console.error(`[DeviceAgent] [${requestId}] Failed to create PlaylistSchedule:`, {
        error: scheduleError.message,
        code: scheduleError.code,
        meta: scheduleError.meta,
        deviceId,
        playlistId,
        tenantId: scheduleTenantId,
        storeId: scheduleStoreId,
      });
      throw scheduleError; // Re-throw to be caught by outer try-catch
    }
    
    // Deactivate any existing active bindings for this device (DeviceEngine v2)
    // Update all existing bindings to status='pending' (deactivate them)
    try {
      const updateResult = await prisma.devicePlaylistBinding.updateMany({
        where: {
          deviceId,
          status: 'ready', // Only deactivate active/ready bindings
        },
        data: {
          status: 'pending', // Mark as inactive
        },
      });
      console.log(`[DeviceAgent] [${requestId}] Deactivated ${updateResult.count} existing bindings`);
    } catch (updateError) {
      console.warn(`[DeviceAgent] [${requestId}] Error deactivating bindings (non-fatal):`, updateError.message);
      // Continue - this is not critical
    }
    
    // Create or upsert a new DevicePlaylistBinding with status='pending' (will be set to 'ready' when device confirms)
    const version = `${playlistId}:${Date.now()}`;
    try {
      const binding = await prisma.devicePlaylistBinding.upsert({
        where: {
          deviceId_playlistId: {
            deviceId,
            playlistId,
          },
        },
        update: {
          version,
          lastPushedAt: new Date(),
          status: 'pending', // Will be updated to 'ready' when device confirms via confirm-playlist-ready
        },
        create: {
          deviceId,
          playlistId,
          version,
          status: 'pending', // Will be updated to 'ready' when device confirms
        },
      });
      
      console.log(`[DeviceAgent] [${requestId}] Created/updated DevicePlaylistBinding:`, {
        bindingId: binding.id,
        deviceId,
        playlistId,
        version,
        status: binding.status,
      });
      
      // Verify the binding exists and is queryable
      const verifyBinding = await prisma.devicePlaylistBinding.findFirst({
        where: {
          deviceId,
          playlistId,
          status: { in: ['ready', 'pending'] },
        },
      });
      
      if (!verifyBinding) {
        console.error(`[DeviceAgent] [${requestId}] WARNING: Binding was created but cannot be found in query!`, {
          deviceId,
          playlistId,
          bindingId: binding.id,
        });
      } else {
        console.log(`[DeviceAgent] [${requestId}] Binding verified and queryable:`, {
          bindingId: verifyBinding.id,
          status: verifyBinding.status,
        });
      }
    } catch (bindingError) {
      console.error(`[DeviceAgent] [${requestId}] Failed to create/update DevicePlaylistBinding:`, {
        error: bindingError.message,
        code: bindingError.code,
        meta: bindingError.meta,
        deviceId,
        playlistId,
        version,
      });
      throw bindingError; // Re-throw to be caught by outer try-catch
    }
    
    console.log(`[DeviceAgent] [${requestId}] SignagePlaylist assigned to device:`, {
      deviceId,
      playlistId,
      version,
      deviceName: device.name,
      playlistName: playlist.name,
      playlistType: playlist.type,
    });
    
    // Broadcast event for real-time updates
    try {
      const { broadcast } = await import('../realtime/sse.js');
      broadcast('device:playlistAssigned', {
        deviceId,
        playlistId,
        version,
        playlistType: 'SIGNAGE',
        at: new Date().toISOString(),
      }, { key: 'admin' });
    } catch (broadcastError) {
      console.warn(`[DeviceAgent] [${requestId}] Failed to broadcast event (non-fatal):`, broadcastError.message);
    }
    
    res.json({
      ok: true,
      deviceId,
      playlistId,
    });
  } catch (error) {
    console.error(`[DeviceAgent] [${requestId}] Assign signage playlist error:`, {
      deviceId: req.params.deviceId,
      playlistId: req.body?.playlistId,
      error: error.message,
      errorCode: error.code,
      errorMeta: error.meta,
      stack: error.stack,
    });
    
    // Provide more specific error messages based on error type
    let errorMessage = 'Failed to assign signage playlist';
    let statusCode = 500;
    
    if (error.code === 'P2002') {
      // Unique constraint violation
      errorMessage = 'Playlist binding already exists for this device';
      statusCode = 409; // Conflict
    } else if (error.code === 'P2003') {
      // Foreign key constraint violation
      errorMessage = 'Invalid device or playlist reference';
      statusCode = 400;
    } else if (error.code === 'P2011') {
      // Null constraint violation
      errorMessage = 'Missing required fields (tenantId or storeId)';
      statusCode = 400;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(statusCode).json({
      ok: false,
      error: 'internal_error',
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? {
        code: error.code,
        meta: error.meta,
      } : undefined,
    });
  }
});

/**
 * GET /api/devices/:deviceId/signage-playlist
 * Get current SignagePlaylist binding for a device
 * 
 * Response:
 *   {
 *     ok: true,
 *     binding: {
 *       playlistId: string | null,
 *       playlistName: string | null
 *     }
 *   }
 */
router.get('/:deviceId/signage-playlist', requireAuth, async (req, res, next) => {
  const requestId = Math.random().toString(36).slice(2, 9);
  
  try {
    const { deviceId } = req.params;
    
    console.log(`[DeviceAgent] [${requestId}] GET /api/devices/${deviceId}/signage-playlist`);
    
    // Validate deviceId
    if (!deviceId || typeof deviceId !== 'string' || deviceId.trim() === '') {
      return res.status(400).json({
        ok: false,
        error: 'deviceId_required',
        message: 'deviceId is required',
      });
    }
    
    // Get the most recent active playlist binding (status='ready')
    const binding = await prisma.devicePlaylistBinding.findFirst({
      where: {
        deviceId,
        status: 'ready', // Only active/ready bindings
      },
      orderBy: { lastPushedAt: 'desc' },
      take: 1,
    });
    
    if (!binding) {
      console.log(`[DeviceAgent] [${requestId}] No active playlist binding for device ${deviceId}`);
      return res.json({
        ok: true,
        binding: {
          playlistId: null,
          playlistName: null,
        },
      });
    }
    
    // Get playlist name (must be SIGNAGE type)
    const playlist = await prisma.playlist.findUnique({
      where: { id: binding.playlistId },
      select: {
        id: true,
        name: true,
        type: true,
      },
    });
    
    // Only return if it's a SIGNAGE playlist
    if (!playlist || playlist.type !== 'SIGNAGE') {
      console.log(`[DeviceAgent] [${requestId}] Playlist ${binding.playlistId} is not SIGNAGE type`);
      return res.json({
        ok: true,
        binding: {
          playlistId: null,
          playlistName: null,
        },
      });
    }
    
    res.json({
      ok: true,
      binding: {
        playlistId: binding.playlistId,
        playlistName: playlist.name,
      },
    });
  } catch (error) {
    console.error(`[DeviceAgent] [${requestId}] Get signage playlist error:`, {
      deviceId: req.params.deviceId,
      error: error.message,
      stack: error.stack,
    });
    
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: error.message || 'Failed to get signage playlist',
    });
  }
});

/**
 * GET /api/devices/:deviceId/status
 * Get device status (dashboard/admin)
 * 
 * Response:
 *   - ok: boolean
 *   - device: object (device data with latest binding and snapshot)
 */
router.get('/:deviceId/status', requireAuth, async (req, res, next) => {
  try {
    const { deviceId } = req.params;

    console.log('[DeviceAgent] GET /api/devices/:deviceId/status', { deviceId });

    const device = await findById(deviceId);

    if (!device) {
      return res.status(404).json({
        ok: false,
        error: 'Device not found',
      });
    }

    // Get connection status from WebSocket hub
    const hub = getDeviceWebSocketHub();
    const isConnected = hub.getConnectionCount(deviceId) > 0;

    res.json({
      ok: true,
      device: {
        id: device.id,
        tenantId: device.tenantId,
        storeId: device.storeId,
        name: device.name,
        model: device.model,
        location: device.location,
        status: device.status,
        orientation: device.orientation || 'horizontal', // Include orientation (defaults to horizontal)
        appVersion: device.appVersion,
        lastSeenAt: device.lastSeenAt,
        isConnected,
        playlist: device.bindings[0] ? {
          playlistId: device.bindings[0].playlistId,
          version: device.bindings[0].version,
          status: device.bindings[0].status,
          lastPushedAt: device.bindings[0].lastPushedAt,
        } : null,
        snapshot: device.snapshots[0] ? {
          playlistVersion: device.snapshots[0].playlistVersion,
          storageFreeMb: device.snapshots[0].storageFreeMb,
          wifiStrength: device.snapshots[0].wifiStrength,
          errorCodes: device.snapshots[0].errorCodes,
          createdAt: device.snapshots[0].createdAt,
        } : null,
      },
    });
  } catch (error) {
    console.error('[DeviceAgent] Get status error:', error);
    next(error);
  }
});

export default router;


