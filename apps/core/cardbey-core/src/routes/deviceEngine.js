/**
 * Device Engine API Routes
 * Exposes device engine tools as HTTP endpoints
 * 
 * Device Engine Map (generated):
 * - Pairing:
 *   * POST /api/device/request-pairing - Device requests pairing code (no auth)
 *   * POST /api/device/complete-pairing - Dashboard completes pairing (no auth)
 *   * POST /api/device/claim - Dashboard claims pairing session (auth required)
 *   * GET /api/device/pair-status/:sessionId - Tablet polls pairing status (no auth)
 * 
 * - Playlist fetch:
 *   * GET /api/device/:deviceId/playlist/full - Device gets full playlist (no auth)
 *   * Returns: { ok, state: "no_binding"|"pending_binding"|"ready", playlist?, message? }
 * 
 * - Heartbeat:
 *   * POST /api/device/heartbeat - Device sends heartbeat (no auth)
 *   * Updates device.lastSeenAt, computes pairingStatus, emits device.status.changed
 *   * Returns: { ok, deviceId, status, pairingStatus, displayName, tenantId, storeId }
 * 
 * - Repair/help:
 *   * POST /api/device/trigger-repair - Dashboard triggers repair (auth required)
 *   * POST /api/device/:id/clear-repair - Clear repair state manually (auth required)
 *   * POST /api/device/pair-alert - Device sends pair alert (no auth)
 *   * POST /api/device/connection-alert - Device sends connection alert (no auth)
 *   * Sets device.status to "repair_requested" | "repair_in_progress" | "online" | "error"
 *   * TV shows waiting page when status is "repair_requested" or "repair_in_progress"
 *   * Status clears on heartbeat with status="online" or via clear-repair endpoint
 * 
 * - Debug:
 *   * GET /api/device/:id/debug - Get device debug snapshot (auth required, read-only)
 *   * Returns: device, bindings, playlist, lastHeartbeat, repairStatus, derivedState
 * 
 * - Device Management:
 *   * POST /api/device/update - Update device information (auth required)
 *   * Accepts: { deviceId, name?, location?, model?, orientation? }
 *   * Returns: { ok: true, device: DeviceDto }
 *   * Also updates associated Screen orientation if provided
 */

import express from 'express';
import { getPrismaClient } from '../db/prisma.js';
import {
  HEARTBEAT_TIMEOUT_MS,
  PRESENCE_ONLINE_MS,
  STALE_AFTER_MS,
  ARCHIVE_ELIGIBLE_AFTER_MS,
  PLAYBACK_REPORT_FRESH_MS,
} from '../constants/devicePresence.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { getEventEmitter } from '../engines/device/events.js';
import { broadcastSse } from '../realtime/simpleSse.js';
import { broadcast as broadcastWebsocket } from '../realtime/websocket.js';
import { resolvePublicUrl, isCloudFrontUrl, buildMediaUrl } from '../utils/publicUrl.js';
import { getCoreBaseUrl, normalizePlaylistItems } from '../utils/normalizeMediaUrl.js';
// Also import from new mediaUrlNormalizer for additional normalization
import { getTranslatedField } from '../services/i18n/translationUtils.js';
import {
  requestPairing,
  completePairing,
  heartbeat,
  confirmPlaylistReady,
  triggerRepair,
} from '../engines/device/index.js';
import {
  enqueueDeviceCommand,
  getPendingCommandsForDevice,
  markCommandsAsExecuted,
  markCommandsAsSent,
} from '../engines/device/commands.js';
import { addDeviceLog, getRecentLogs } from '../engines/device/logs.js';
import {
  RequestPairingInput,
  CompletePairingInput,
  HeartbeatInput,
  PushPlaylistInput,
  ConfirmPlaylistReadyInput,
  TriggerRepairInput,
  PairAlertInput,
} from '../engines/device/types.js';

const router = express.Router();
const prisma = getPrismaClient();

/**
 * Extract language code from Accept-Language header
 * Supports formats like "en", "en-US", "vi", "vi-VN"
 * Returns the primary language code (e.g., "en" or "vi")
 */
function extractLanguageFromHeader(acceptLanguage) {
  if (!acceptLanguage) return null;
  
  // Parse Accept-Language header (e.g., "en-US,en;q=0.9,vi;q=0.8")
  const languages = acceptLanguage.split(',').map(lang => {
    const parts = lang.split(';')[0].trim().toLowerCase();
    return parts.split('-')[0]; // Extract primary language code
  });
  
  // Return first supported language (en or vi)
  const supported = ['en', 'vi'];
  return languages.find(lang => supported.includes(lang)) || null;
}

/**
 * Create engine context with services
 */
function createEngineContext() {
  return {
    services: {
      db: prisma,
      events: getEventEmitter(),
    },
  };
}

/** DevicePlaylistBinding.status is stored as lowercase in new code, but tolerate legacy casing. */
function isActivePlaylistBindingStatus(status) {
  const s = String(status ?? '').trim().toLowerCase();
  return s === 'ready' || s === 'pending';
}

const IS_DEV = process.env.NODE_ENV !== 'production';

/**
 * Derived presence fields for list API (heartbeat is source of truth for lastSeenAt).
 */
function computeDevicePresenceFields(lastSeenAt, now = new Date()) {
  if (!lastSeenAt) {
    return {
      isOnline: false,
      presenceTier: 'offline',
      staleState: 'stale',
      archiveEligible: false,
    };
  }
  const last = new Date(lastSeenAt).getTime();
  const deltaMs = Math.max(0, now.getTime() - last);
  const isOnline = deltaMs < HEARTBEAT_TIMEOUT_MS;
  let presenceTier = 'offline';
  if (deltaMs >= 0 && deltaMs < PRESENCE_ONLINE_MS) {
    presenceTier = 'online';
  } else if (deltaMs >= 0 && deltaMs < HEARTBEAT_TIMEOUT_MS) {
    presenceTier = 'recently_active';
  }

  let staleState = 'active';
  if (deltaMs >= ARCHIVE_ELIGIBLE_AFTER_MS) {
    staleState = 'archive_eligible';
  } else if (deltaMs >= STALE_AFTER_MS) {
    staleState = 'stale';
  }

  return {
    isOnline,
    presenceTier,
    staleState,
    archiveEligible: deltaMs >= ARCHIVE_ELIGIBLE_AFTER_MS,
  };
}

/**
 * Optional nested playbackReport on heartbeat (additive; older clients omit).
 */
function parsePlaybackReportPatch(body, now = new Date()) {
  const raw = body?.playbackReport;
  if (!raw || typeof raw !== 'object') return null;
  const patch = {};
  let reportAt = now;
  const lp = raw.lastPlaybackAt;
  if (typeof lp === 'number' && Number.isFinite(lp)) {
    reportAt = new Date(lp);
  } else if (typeof lp === 'string' && lp.trim()) {
    const t = Date.parse(lp);
    if (!Number.isNaN(t)) reportAt = new Date(t);
  }
  patch.lastPlaybackReportAt = reportAt;
  if (typeof raw.isPlaying === 'boolean') {
    patch.playbackReportIsPlaying = raw.isPlaying;
  }
  const st = raw.playbackState ?? raw.state;
  if (st != null && String(st).trim() !== '') {
    patch.playbackReportState = String(st).slice(0, 64);
  }
  return patch;
}

/**
 * Heartbeat-derived presence + optional client playback snapshot (playing_degraded when heartbeat stale but playback fresh).
 */
function computeDevicePresenceWithPlayback(device, now = new Date()) {
  const hb = computeDevicePresenceFields(device.lastSeenAt, now);
  const lastPb = device.lastPlaybackReportAt;
  let playbackReported = false;
  let playbackFresh = false;
  let activelyPlaying = false;

  if (lastPb) {
    const pbDelta = now.getTime() - new Date(lastPb).getTime();
    playbackFresh = pbDelta >= 0 && pbDelta < PLAYBACK_REPORT_FRESH_MS;
    playbackReported = playbackFresh;
    const st = String(device.playbackReportState ?? '').toLowerCase();
    const isp = device.playbackReportIsPlaying;
    activelyPlaying =
      isp === true ||
      st === 'buffering' ||
      (st === 'ready' && isp !== false);
  }

  const base = {
    ...hb,
    playbackReported,
    lastPlaybackReportAt: lastPb ?? null,
    playbackReportState: device.playbackReportState ?? null,
    playbackReportIsPlaying: device.playbackReportIsPlaying ?? null,
  };

  if (hb.presenceTier === 'offline' && playbackFresh && activelyPlaying) {
    if (IS_DEV) {
      console.log('[PRESENCE]', {
        deviceId: device.id ?? null,
        presenceTier: 'playing_degraded',
        lastSeenAt: device.lastSeenAt,
        lastPlaybackReportAt: lastPb,
        playbackReportState: device.playbackReportState,
        playbackReportIsPlaying: device.playbackReportIsPlaying,
      });
    }
    return {
      ...base,
      presenceTier: 'playing_degraded',
      isOnline: false,
    };
  }

  return base;
}

/**
 * Broadcast a standardized pair alert event to SSE + WebSocket clients
 * When a DEVICE V2 device starts a new pairing session, we emit both
 * `device.pairing.requested` and `pair_alert` events for the dashboard's
 * global pairing alert popup.
 * 
 * @param {Record<string, any>} payload
 */
function emitPairAlertEvent(payload) {
  // Emit pair_alert event (primary event for dashboard popup)
  const pairAlertEnvelope = {
    type: 'pair_alert',
    data: payload,
  };
  
  broadcastSse('admin', 'pair_alert', pairAlertEnvelope);
  console.log('[Pairing] Emitted pair_alert event via SSE', {
    deviceId: payload.deviceId,
    code: payload.code,
    reason: payload.reason,
  });
  
  // Also emit device.pairing.requested event (for frontend compatibility)
  const pairingRequestedPayload = {
    type: 'device.pairing.requested',
    payload: {
      sessionId: payload.deviceId,
      deviceId: payload.deviceId,
      deviceName: payload.deviceName,
      deviceType: payload.deviceType,
      code: payload.code,
      engine: 'DEVICE_V2',
      tenantId: payload.tenantId || 'temp',
      storeId: payload.storeId || 'temp',
      expiresAt: payload.expiresAt,
      createdAt: payload.timestamp,
    },
  };
  
  broadcastSse('admin', 'device.pairing.requested', pairingRequestedPayload);
  console.log('[Pairing] Emitted device.pairing.requested event via SSE', {
    sessionId: payload.deviceId,
    code: payload.code,
  });
  
  // Broadcast to WebSocket clients as well
  broadcastWebsocket(
    {
      type: 'pair_alert',
      payload,
    },
    { key: 'admin' }
  );
  
  broadcastWebsocket(
    {
      type: 'device.pairing.requested',
      payload: pairingRequestedPayload.payload,
    },
    { key: 'admin' }
  );
}

/**
 * GET /api/device/list
 * List devices for a tenant/store
 */
router.get('/list', requireAuth, async (req, res) => {
  try {
    console.log('[HTTP] GET /api/device/list', { query: req.query });

    const { tenantId, storeId } = req.query;
    const rawStatus = String(req.query.status || 'all').toLowerCase();
    const listStatusFilter = ['active', 'stale', 'all'].includes(rawStatus) ? rawStatus : 'all';
    const includeArchived =
      req.query.includeArchived === '1' ||
      req.query.includeArchived === 'true';

    if (!tenantId || !storeId) {
      console.warn('[Device Engine] List missing parameters:', { tenantId, storeId });
      return res.status(400).json({
        ok: false,
        error: 'Missing required parameters',
        message: 'tenantId and storeId are required',
      });
    }

    const now = new Date();
    const staleCutoff = new Date(now.getTime() - STALE_AFTER_MS);

    // Build where clause with explicit logging
    const where = {
      tenantId: String(tenantId),
      storeId: String(storeId),
    };

    // Note: Device.archivedAt is not present in the current Prisma schema.
    // We keep `includeArchived` for API compatibility, but it doesn't filter
    // via archivedAt (to avoid Prisma validation errors).

    if (listStatusFilter === 'active') {
      where.lastSeenAt = { gte: staleCutoff };
    } else if (listStatusFilter === 'stale') {
      where.OR = [{ lastSeenAt: null }, { lastSeenAt: { lt: staleCutoff } }];
    }

    console.log('[Device Engine] List devices where=%o', where);

    // Query devices with latest playlist binding and snapshot
    const devices = await prisma.device.findMany({
      where,
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Observability: device identity contract diagnostics for list visibility.
    const [mismatchCountSameTenant, tempCount] = await Promise.all([
      prisma.device.count({
        where: {
          tenantId: String(tenantId),
          storeId: { not: String(storeId) },
        },
      }),
      prisma.device.count({
        where: {
          tenantId: 'temp',
          storeId: 'temp',
        },
      }),
    ]);
    console.log('[DEVICE LIST QUERY]', {
      tenantId: String(tenantId),
      storeId: String(storeId),
      matchedCount: devices.length,
      mismatchCountSameTenant,
      tempCount,
    });

    console.log('[DEVICE LIST] Query result: count=%d', devices.length);
    console.log('[DEVICE LIST] Found devices:', devices.length, { tenantId, storeId });

    // Defensive logging: If no devices found, investigate
    if (devices.length === 0) {
      console.warn('[DEVICE ENGINE] WARNING: No devices found.');
      console.warn('[DEVICE ENGINE] Check if pairing created a row in DB.');
      console.warn('[DEVICE ENGINE] tenantId=%s storeId=%s', tenantId, storeId);
      
      // Temporary diagnostic query: Get all devices to see what's in DB
      try {
        const allDevices = await prisma.device.findMany({
          take: 50,
          select: {
            id: true,
            tenantId: true,
            storeId: true,
            name: true,
            platform: true,
            status: true,
            pairingCode: true,
            lastSeenAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });
        
        console.log('[DEVICE ENGINE] Diagnostic: All devices in DB (first 50):', 
          allDevices.map(d => ({
            id: d.id,
            tenantId: d.tenantId,
            storeId: d.storeId,
            name: d.name,
            platform: d.platform,
            status: d.status,
            hasPairingCode: !!d.pairingCode,
            lastSeenAt: d.lastSeenAt?.toISOString(),
            createdAt: d.createdAt.toISOString(),
          }))
        );
      } catch (diagError) {
        console.error('[DEVICE ENGINE] Failed to run diagnostic query:', diagError);
      }
    }

    // Diagnostic logging for offline devices
    devices.forEach((device) => {
      if (device.lastSeenAt) {
        const timeSinceLastSeen = now.getTime() - new Date(device.lastSeenAt).getTime();
        const minutesAgo = Math.round(timeSinceLastSeen / 60000);
        if (minutesAgo > 5) {
          console.log(`[DEVICE LIST] Device ${device.id} (${device.name || 'unnamed'}) last seen ${minutesAgo} minutes ago - OFFLINE`);
        }
      } else {
        console.log(`[DEVICE LIST] Device ${device.id} (${device.name || 'unnamed'}) has never sent a heartbeat`);
      }
    });
    
    // Get playlist names for devices with playlist bindings
    const playlistIds = devices
      .map(d => d.bindings?.[0]?.playlistId)
      .filter(Boolean);
    
    const playlists = playlistIds.length > 0
      ? await prisma.playlist.findMany({
          where: { 
            id: { in: playlistIds },
            type: { in: ['SIGNAGE', 'MEDIA'] },
          },
          select: { id: true, name: true },
        })
      : [];
    
    const playlistMap = new Map(playlists.map(p => [p.id, p.name]));
    
    // Format response
    const formattedDevices = devices.map((device) => {
      const latestBinding = device.bindings[0] || null;
      const latestSnapshot = device.snapshots[0] || null;

      const presence = computeDevicePresenceWithPlayback(device, now);
      const isOnline = presence.isOnline;

      // Get playlist info
      const playlistId = latestBinding?.playlistId || null;
      const playlistName = playlistId ? playlistMap.get(playlistId) || null : null;

      return {
        id: device.id,
        tenantId: device.tenantId,
        storeId: device.storeId,
        name: device.name,
        model: device.model,
        location: device.location,
        status: isOnline ? 'online' : 'offline',
        isOnline,
        presenceTier: presence.presenceTier,
        playbackReported: presence.playbackReported,
        lastPlaybackReportAt: presence.lastPlaybackReportAt
          ? new Date(presence.lastPlaybackReportAt).toISOString()
          : null,
        playbackReportIsPlaying: presence.playbackReportIsPlaying,
        playbackReportState: presence.playbackReportState,
        staleState: presence.staleState,
        archiveEligible: presence.archiveEligible,
        archivedAt: null,
        type: device.type || 'other', // Include device type
        platform: device.platform || null, // Include platform
        appVersion: device.appVersion,
        lastSeenAt: device.lastSeenAt,
        createdAt: device.createdAt,
        updatedAt: device.updatedAt,
        playlistId: playlistId || null, // Add playlistId field
        playlistName: playlistName || null, // Add playlistName field
        playlist: latestBinding
          ? {
              playlistId: latestBinding.playlistId,
              version: latestBinding.version,
              status: latestBinding.status,
              lastPushedAt: latestBinding.lastPushedAt,
            }
          : null,
        lastSnapshot: latestSnapshot
          ? {
              timestamp: latestSnapshot.createdAt,
              playlistVersion: latestSnapshot.playlistVersion,
              storageFreeMb: latestSnapshot.storageFreeMb,
              wifiStrength: latestSnapshot.wifiStrength,
              errorCodes: latestSnapshot.errorCodes,
            }
          : null,
        lastScreenshotBase64: device.lastScreenshotBase64 || null,
        lastScreenshotAt: device.lastScreenshotAt || null,
      };
    });

    const response = {
      ok: true,
      data: {
        devices: formattedDevices,
        listFilter: {
          status: listStatusFilter,
          includeArchived,
          heartbeatTimeoutSeconds: HEARTBEAT_TIMEOUT_MS / 1000,
        },
      },
    };

    console.log('[Device Engine] List response:', {
      deviceCount: formattedDevices.length,
      tenantId,
      storeId,
      listStatusFilter,
      includeArchived,
    });

    res.json(response);
  } catch (error) {
    console.error('[Device Engine] List error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to list devices',
    });
  }
});

/**
 * POST /api/device/archive/:deviceId
 * Sets archivedAt (soft archive). Excluded from default GET /api/device/list.
 * Query: tenantId, storeId (required; must match device)
 */
router.post('/archive/:deviceId', requireAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { tenantId, storeId } = req.query;

    if (!tenantId || !storeId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required parameters',
        message: 'tenantId and storeId are required',
      });
    }

    // Device.archivedAt is not present in the current Prisma schema.
    // Return 501 to prevent repeated Prisma validation errors.
    return res.status(501).json({
      ok: false,
      error: 'not_implemented',
      message: 'Device archiving is not available in this schema version (archivedAt column missing).',
      deviceId,
      tenantId: String(tenantId),
      storeId: String(storeId),
    });
  } catch (error) {
    console.error('[Device Engine] Archive error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to archive device',
    });
  }
});

/**
 * POST /api/device/request-pairing
 * POST /api/device/pair-request (alias for backward compatibility)
 * 
 * Device V2 Pairing Endpoint
 * Request pairing code for a new device (Device-initiated, no auth required)
 * 
 * Expected request body (all fields optional):
 *   - deviceModel?: string
 *   - platform?: string
 *   - appVersion?: string
 *   - capabilities?: object
 *   - initialState?: object
 *   - deviceType?: string
 * 
 * Success response (200):
 *   {
 *     ok: true,
 *     sessionId: string,  // Device V2 tablet expects this field name
 *     code: string,       // Device V2 tablet expects this field name
 *     expiresAt: string (ISO 8601)
 *   }
 * 
 * Error responses:
 *   - 400: { ok: false, error: 'invalid_input', message: string }
 *   - 500: { ok: false, error: 'pairing_failed', message: string }
 */
const handleRequestPairing = async (req, res) => {
  const requestId = Math.random().toString(36).slice(2, 9);
  
  try {
    // Log incoming request with full context
    console.log(`[PAIRING] Incoming pairing request from ${req.ip}`);
    console.log(`[PAIRING] Endpoint: POST /api/device/request-pairing (OLD FLOW - device-initiated)`);
    console.log(`[PAIRING] NOTE: For Device Engine V2 dashboard-initiated pairing, use POST /api/device/pair/init (dashboard) then POST /api/device/pair/complete (device)`);
    console.log(`[PAIRING] Payload:`, {
      deviceId: req.body?.deviceId || 'not provided',
      pairingCode: req.body?.pairingCode || 'not provided',
      engineVersion: req.body?.appVersion || req.body?.engineVersion || 'not provided',
      model: req.body?.deviceModel || req.body?.model || 'not provided',
      platform: req.body?.platform || 'not provided',
    });
    console.log(`[DeviceEngine V2] [${requestId}] Pairing request received`, {
      method: req.method,
      path: req.path,
      body: req.body,
      query: req.query,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
      },
      ip: req.ip,
    });

    // Check if body is a valid object
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      console.warn(`[DeviceEngine V2] [${requestId}] Invalid request body`, {
        bodyType: typeof req.body,
        isArray: Array.isArray(req.body),
      });
      
      return res.status(400).json({
        ok: false,
        error: 'invalid_input',
        message: 'Request body must be a JSON object',
      });
    }

    // Very permissive schema - all fields optional with defaults
    const body = req.body || {};
    
    // Handle backward compatibility: map legacy fields
    const normalizedBody = { ...body };
    if (normalizedBody.deviceType && !normalizedBody.deviceModel) {
      normalizedBody.deviceModel = normalizedBody.deviceType;
    }
    if (normalizedBody.label && !normalizedBody.platform) {
      normalizedBody.platform = normalizedBody.label;
    }

    // Fill defaults for missing fields
    const input = {
      deviceModel: normalizedBody.deviceModel || 'unknown-model',
      platform: normalizedBody.platform || 'unknown-platform',
      appVersion: normalizedBody.appVersion || '0.0.0',
      capabilities: normalizedBody.capabilities || {},
      initialState: normalizedBody.initialState || {},
      deviceType: normalizedBody.deviceType, // Pass through explicit deviceType if provided
    };

    console.log(`[DeviceEngine V2] [${requestId}] Calling requestPairing service`, {
      input: {
        deviceModel: input.deviceModel,
        platform: input.platform,
        appVersion: input.appVersion,
        hasCapabilities: !!input.capabilities && Object.keys(input.capabilities).length > 0,
        hasInitialState: !!input.initialState && Object.keys(input.initialState).length > 0,
        deviceType: input.deviceType,
      },
    });

    // Call request pairing function with relaxed input
    const result = await requestPairing(input, createEngineContext());

    // Validate result has required fields for Device V2 tablet format
    // Tablet expects: { ok: true, sessionId, code, expiresAt }
    const sessionId = result?.id || result?.deviceId || result?.sessionId;
    const code = result?.code || result?.pairingCode || result?.pairCode;
    const expiresAt = result?.expiresAt;

    if (!sessionId || !code || !expiresAt) {
      console.error(`[DeviceEngine V2] [${requestId}] Pairing output missing required fields`, {
        result,
        hasId: !!result?.id,
        hasDeviceId: !!result?.deviceId,
        hasSessionId: !!result?.sessionId,
        hasCode: !!result?.code,
        hasPairingCode: !!result?.pairingCode,
        hasPairCode: !!result?.pairCode,
        hasExpiresAt: !!result?.expiresAt,
      });
      
      return res.status(500).json({
        ok: false,
        error: 'invalid_pairing_response',
        message: 'Missing sessionId or code in pairing result.',
      });
    }

    // Log success with key details
    console.log(`[DeviceEngine V2] [${requestId}] Pairing success`, {
      sessionId,
      code,
      expiresAt,
      platform: input.platform,
      deviceModel: input.deviceModel,
    });

    // Emit pair_alert event for dashboard to show popup
    // This tells the dashboard that a device is waiting to be paired
    try {
      const alertPayload = {
        alertId: `pair-${sessionId}`,
        deviceId: sessionId,
        deviceName: input.deviceModel || `Device ${sessionId.slice(0, 8)}`,
        deviceType: input.deviceType || 'screen',
        lastSeen: new Date().toISOString(),
        reason: 'pair_request',
        status: 'pending',
        tenantId: 'temp',
        storeId: 'temp',
        timestamp: new Date().toISOString(),
        code: code,
        expiresAt: expiresAt,
      };
      
      console.log(`[PAIR ALERT] Device ${sessionId} requesting pairing. Broadcasting to dashboard...`, {
        code,
        deviceModel: input.deviceModel,
      });
      
      emitPairAlertEvent(alertPayload);
      
      console.log(`[SSE] Broadcasted pair_alert event for ${sessionId}`);
    } catch (alertError) {
      // Don't fail the pairing request if alert broadcast fails
      console.error(`[PAIR ALERT] Failed to broadcast (non-fatal):`, alertError);
    }

    // Return Device V2 tablet-expected response format
    res.status(200).json({
      ok: true,
      sessionId,  // Required by tablet
      code,       // Required by tablet
      expiresAt,  // Required by tablet
    });
  } catch (error) {
    // Log detailed error for server debugging
    console.error(`[DeviceEngine V2] [${requestId}] Pairing ERROR`, {
      message: error?.message,
      name: error?.name,
      code: error?.code,
      stack: error?.stack,
      cause: error?.cause,
    });

    // Return structured error response (don't expose internal details)
    res.status(500).json({
      ok: false,
      error: 'pairing_failed',
      message: 'Device pairing failed due to an internal error. Please try again.',
    });
  }
};

// Register both routes (alias for backward compatibility)
router.post('/request-pairing', handleRequestPairing);
router.post('/pair-request', handleRequestPairing);

/**
 * POST /api/device/complete-pairing
 * Complete pairing with a pairing code (Dashboard-initiated, no auth required)
 */
router.post('/complete-pairing', optionalAuth, async (req, res) => {
  try {
    const body = req.body || {};
    console.log('[Device Engine] POST /api/device/complete-pairing', { body });

    // Debug: capture raw inputs + auth presence before validation/transforms
    console.log('[PAIRING INPUT DEBUG]', {
      sessionId: body?.sessionId,
      deviceId: body?.deviceId,
      pairingCode: body?.pairingCode,
      storeId: body?.storeId,
      authUser: req.user ? { id: req.user?.id, email: req.user?.email, isDevAdmin: req.user?.isDevAdmin } : null,
    });

    // Contract enforcement: pairing completion requires authenticated tenant context.
    const authTenantId = req.user?.id || null;
    if (!authTenantId) {
      return res.status(401).json({
        ok: false,
        error: 'unauthorized_tenant_context_required',
        message: 'Pairing requires authenticated tenant context',
      });
    }

    const parsed = CompletePairingInput.safeParse(req.body);
    if (!parsed.success) {
      console.error('[Device Engine] Complete pairing validation error:', {
        body,
        issues: parsed.error.issues,
      });
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        issues: parsed.error.issues,
      });
    }

    const input = parsed.data;
    // Contract enforcement:
    // - Tenant is sourced from auth only.
    // - Store is sourced from the dashboard-selected storeId in the request body.
    const effectiveTenantId = authTenantId;
    const effectiveStoreId = req.body?.storeId || input.storeId;
    if (!effectiveStoreId || String(effectiveStoreId).trim() === '' || effectiveStoreId === 'temp') {
      return res.status(400).json({
        ok: false,
        error: 'missing_fields',
        message: 'storeId is required',
      });
    }

    const sessionIdRaw = req.body?.sessionId || req.body?.deviceId || input.sessionId || input.deviceId;
    const sessionId = typeof sessionIdRaw === 'string' ? sessionIdRaw.trim() : String(sessionIdRaw || '').trim();
    if (!sessionId) {
      return res.status(400).json({
        ok: false,
        error: 'missing_fields',
        message: 'sessionId (or deviceId) is required',
      });
    }

    const effectiveInput = {
      ...input,
      tenantId: effectiveTenantId,
      storeId: effectiveStoreId,
      sessionId,
    };

    console.log('[PAIRING COMPLETE] request context', {
      authTenantId,
      inputTenantId: input.tenantId || null,
      effectiveTenantId,
      inputStoreId: input.storeId,
      effectiveStoreId,
      sessionId,
    });

    const result = await completePairing(effectiveInput, createEngineContext());

    // Ensure response has ok: true for successful pairing
    // The result already includes ok: true from completePairing
    console.log('[Device Engine] Complete pairing response:', {
      ok: result.ok,
      deviceId: result.deviceId,
      status: result.status,
    });

    // Critical: prevent false success. Pairing must commit non-temp identity.
    const committedTenantId = result?.data?.device?.tenantId ?? null;
    const committedStoreId = result?.data?.device?.storeId ?? result?.storeId ?? null;
    if (!committedTenantId || committedTenantId === 'temp' || !committedStoreId || committedStoreId === 'temp') {
      console.error('[PAIRING COMMIT RESULT]', {
        ok: false,
        reason: 'identity_not_committed',
        deviceId: result?.deviceId,
        committedTenantId,
        committedStoreId,
      });
      return res.status(500).json({
        ok: false,
        error: 'pairing_commit_failed',
        message: 'Pairing did not commit tenant/store identity. Please retry pairing.',
      });
    }
    console.log('[PAIRING COMMIT RESULT]', {
      ok: true,
      deviceId: result?.deviceId,
      tenantId: committedTenantId,
      storeId: committedStoreId,
    });

    res.json(result);
  } catch (error) {
    console.error('[Device Engine] Complete pairing error:', error);
    
    // Return error message in response (don't expose stack trace)
    const errorMessage = error.message || 'Failed to complete pairing';
    
    // Check if it's a known error (device not found, expired, etc.)
    if (errorMessage.includes('not found') || errorMessage.includes('invalid')) {
      return res.status(400).json({
        ok: false,
        error: errorMessage,
      });
    }
    
    if (errorMessage.includes('expired')) {
      return res.status(400).json({
        ok: false,
        error: errorMessage,
      });
    }
    
    // Other errors return 500
    res.status(500).json({
      ok: false,
      error: errorMessage,
    });
  }
});

/**
 * POST /api/device/heartbeat
 * Single source of truth for device presence (Device-initiated, no auth required)
 * Upserts Device record, computes pairingStatus, and emits device.status.changed SSE event
 * 
 * Request body:
 *   - deviceId?: string - Device ID (creates new device if not provided)
 *   - engineVersion?: string - Device engine version
 *   - platform?: string - Platform identifier
 *   - tenantId?: string - Tenant ID
 *   - storeId?: string - Store ID
 *   - status?: "online" | "offline" | "degraded" - Device status
 *   - executedCommandIds?: string[] - Array of command IDs that were executed
 *   - playbackState?: object - Playback state information
 *   - alert?: { type: string, message: string } - Optional alert payload
 *     When alert is present, creates a DeviceAlert and emits device:alert SSE event.
 *     This allows devices to batch alerts with heartbeats when connection recovers.
 * 
 * Response:
 *   - ok: boolean
 *   - deviceId: string
 *   - status: "online" | "offline"
 *   - pairingStatus: string
 *   - displayName: string
 *   - tenantId: string | null
 *   - storeId: string | null
 */
router.post('/heartbeat', async (req, res) => {
  try {
    const body = req.body || {};
    const {
      deviceId: providedDeviceId,
      engineVersion,
      platform,
      tenantId: bodyTenantId,
      storeId: bodyStoreId,
      status: bodyStatus,
      executedCommandIds,
      playbackState,
      alert: alertPayload, // Optional alert payload
    } = body;

    // Default status to "online" if not provided
    const status = bodyStatus || 'online';

    // ADDED: Enhanced diagnostic logging for incoming heartbeats
    if (!providedDeviceId) {
      console.warn('[device/heartbeat] Missing deviceId in request body');
    } else {
      const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
      console.log(`[device/heartbeat] Received heartbeat from device: ${providedDeviceId} (IP: ${clientIp})`);
    }

    // Comprehensive heartbeat logging
    console.log(`[HEARTBEAT] Device ${providedDeviceId || 'NEW'} heartbeat received`);
    console.log(`[HEARTBEAT] Payload:`, {
      battery: body.battery || 'not provided',
      appVersion: engineVersion || body.appVersion || 'not provided',
      orientation: body.orientation || 'not provided',
      playlistState: playbackState ? {
        playlistId: playbackState.playlistId,
        currentIndex: playbackState.currentIndex,
        isPlaying: playbackState.isPlaying,
      } : 'not provided',
      tenantId: bodyTenantId || 'not provided',
      storeId: bodyStoreId || 'not provided',
      status: status,
    });

    // Handle executed command acknowledgements first (if deviceId is provided)
    if (providedDeviceId && executedCommandIds && Array.isArray(executedCommandIds) && executedCommandIds.length > 0) {
      await markCommandsAsExecuted(executedCommandIds);
      console.log('[Device Engine] Marked commands as executed:', executedCommandIds);
      
      // Log command execution
      await addDeviceLog({
        deviceId: providedDeviceId,
        source: 'command',
        level: 'debug',
        message: 'Commands executed',
        payload: { ids: executedCommandIds },
      });
      
      // Broadcast command execution
      broadcastSse(
        'admin',
        'device:commandExecuted',
        {
          deviceId: providedDeviceId,
          ids: executedCommandIds,
          at: new Date().toISOString(),
        }
      );
    }

    // Upsert Device record
    let device;
    let deviceId;
    const now = new Date();
    const playbackReportPatch = parsePlaybackReportPatch(body, now);

    // Enhanced logging for DEVICE v2 heartbeats
    const isDeviceV2 = engineVersion && (
      engineVersion.includes('DEVICE') || 
      engineVersion.includes('v2') || 
      engineVersion.includes('V2')
    );

    if (isDeviceV2) {
      console.log('[Device Engine] DEVICE v2 heartbeat', {
        deviceId: providedDeviceId || 'NEW',
        engineVersion,
        platform,
        status,
        ip: req.ip,
        timestamp: now.toISOString(),
        hasTenantId: !!bodyTenantId,
        hasStoreId: !!bodyStoreId,
      });
    }

    if (!providedDeviceId || providedDeviceId.trim() === '') {
      // Create new device
      // For new devices, use provided tenantId/storeId or default to 'temp' values
      const tenantId = bodyTenantId || 'temp';
      const storeId = bodyStoreId || 'temp';

      device = await prisma.device.create({
        data: {
          tenantId,
          storeId,
          status: 'online', // Always set to 'online' when heartbeat received
          lastSeenAt: now,
          platform: platform || undefined,
          appVersion: engineVersion || undefined,
          name: 'Unnamed Device',
          orientation: 'horizontal', // Default orientation for new devices
          ...(playbackReportPatch || {}),
        },
        select: {
          id: true,
          name: true,
          status: true,
          orientation: true,
          tenantId: true,
          storeId: true,
          lastSeenAt: true,
          platform: true,
          appVersion: true,
          lastPlaybackReportAt: true,
          playbackReportIsPlaying: true,
          playbackReportState: true,
        },
      });
      deviceId = device.id;
      console.log('[HEARTBEAT] Created new device', { deviceId, tenantId, storeId, platform, engineVersion });

      console.log('[HEARTBEAT IDENTITY]', {
        deviceId: device.id,
        tenantId: device.tenantId,
        storeId: device.storeId,
        status: device.status,
        lastSeenAt: device.lastSeenAt?.toISOString?.() ?? null,
      });
    } else {
      // Update existing device or create if not found
      deviceId = providedDeviceId;
      
      try {
        // First, fetch current device to check repair state, pairing state, and get orientation
        const currentDevice = await prisma.device.findUnique({
          where: { id: deviceId },
          select: { 
            id: true,
            name: true,
            status: true,
            orientation: true,
            tenantId: true,
            storeId: true,
            pairingCode: true,
            lastSeenAt: true, // ADDED: Include lastSeenAt for reconnection detection
          },
        });

        if (!currentDevice) {
          // Device not found - create it
          const tenantId = bodyTenantId || 'temp';
          const storeId = bodyStoreId || 'temp';
          
          device = await prisma.device.create({
            data: {
              id: deviceId,
              tenantId,
              storeId,
              status: 'online',
              lastSeenAt: now,
              platform: platform || undefined,
              appVersion: engineVersion || undefined,
              name: 'Unnamed Device',
              orientation: 'horizontal', // Default orientation for new devices
              ...(playbackReportPatch || {}),
            },
            select: {
              id: true,
              name: true,
              status: true,
              orientation: true,
              tenantId: true,
              storeId: true,
              lastSeenAt: true,
              platform: true,
              appVersion: true,
              lastPlaybackReportAt: true,
              playbackReportIsPlaying: true,
              playbackReportState: true,
            },
          });
          console.log('[HEARTBEAT] Created device with provided ID', { deviceId, tenantId, storeId, platform, engineVersion });
        } else {
          // Check if device is transitioning from unpaired to paired
          const wasUnpaired = (currentDevice.tenantId === 'temp' && currentDevice.storeId === 'temp') || 
                               currentDevice.pairingCode !== null;
          const willBePaired = bodyTenantId && bodyStoreId && 
                               bodyTenantId !== 'temp' && bodyStoreId !== 'temp';
          
          // Log if this is a newly-paired device (recently completed pairing)
          const recentlyPaired = !wasUnpaired && willBePaired;
          if (recentlyPaired && isDeviceV2) {
            console.log('[Device Engine] Heartbeat from newly-paired device', {
              deviceId,
              tenantId: bodyTenantId,
              storeId: bodyStoreId,
              platform,
            });
          }
          const isPairingTransition = wasUnpaired && willBePaired;
          
          // Handle status updates on heartbeat:
          // - If device is in repair state (repair_requested, repair_in_progress), keep it in repair state
          //   UNLESS heartbeat explicitly sets status to 'online' (device recovered)
          // - Otherwise, set to 'online' when heartbeat received (unless explicitly 'offline' or 'degraded')
          const isRepairState = currentDevice.status === 'repair_requested' || currentDevice.status === 'repair_in_progress';
          let heartbeatStatus;
          
          if (isRepairState) {
            // Device is in repair - only clear if heartbeat explicitly says 'online'
            if (status === 'online') {
              heartbeatStatus = 'online';
              console.log('[HEARTBEAT] Device cleared repair state via heartbeat', { deviceId, previousStatus: currentDevice.status });
            } else {
              // Keep in repair state
              heartbeatStatus = currentDevice.status;
              console.log('[HEARTBEAT] Device still in repair state', { deviceId, status: currentDevice.status });
            }
          } else {
            // Normal status handling
            heartbeatStatus = (status === 'offline' || status === 'degraded') ? status : 'online';
          }
          
          // Build update data - always update tenantId/storeId if provided and valid
          const updateData = {
            status: heartbeatStatus, // Update status on heartbeat (respects repair state)
            lastSeenAt: now, // Critical: Update lastSeenAt for offline detection
            ...(platform && { platform }),
            ...(engineVersion && { appVersion: engineVersion }),
            ...(playbackReportPatch || {}),
          };
          
          // Heartbeat safeguard (Device Identity Contract):
          // If device is already paired (real tenant+store and no pairingCode), never drift tenant/store from heartbeat payload.
          const alreadyPairedIdentity =
            currentDevice.tenantId !== 'temp' &&
            currentDevice.storeId !== 'temp' &&
            !currentDevice.pairingCode;

          // Update tenantId/storeId only when NOT already paired and the payload provides real values.
          if (!alreadyPairedIdentity) {
            if (bodyTenantId && bodyTenantId !== 'temp') {
              updateData.tenantId = bodyTenantId;
            }
            if (bodyStoreId && bodyStoreId !== 'temp') {
              updateData.storeId = bodyStoreId;
            }
          }
          
          // Clear pairing code if device is being paired
          if (isPairingTransition) {
            updateData.pairingCode = null;
            console.log('[HEARTBEAT] Device pairing transition detected, clearing pairing code', {
              deviceId,
              oldTenantId: currentDevice.tenantId,
              newTenantId: bodyTenantId,
              oldStoreId: currentDevice.storeId,
              newStoreId: bodyStoreId,
            });
          }
          
          // ADDED: Check if device is coming back online after being offline
          const wasOffline = currentDevice.status === 'offline' || currentDevice.status === 'OFFLINE';
          const timeSinceLastSeen = currentDevice.lastSeenAt 
            ? now.getTime() - new Date(currentDevice.lastSeenAt).getTime() 
            : 0;
          
          // Log when device comes back online after being offline (more than 1 minute)
          if (wasOffline && heartbeatStatus === 'online' && timeSinceLastSeen > 60000) {
            const secondsOffline = Math.round(timeSinceLastSeen / 1000);
            console.log(`[device.heartbeatV2] Device ${deviceId} (${currentDevice.name || 'unnamed'}) came back online after ${secondsOffline}s`);
          }
          
          // Log first heartbeat if device has never been seen
          if (!currentDevice.lastSeenAt) {
            console.log(`[device.heartbeatV2] First heartbeat from device: ${deviceId} (${currentDevice.name || 'unnamed'})`);
          }

          device = await prisma.device.update({
            where: { id: deviceId },
            data: updateData,
            select: {
              id: true,
              name: true,
              status: true,
              orientation: true,
              tenantId: true,
              storeId: true,
              lastSeenAt: true,
              platform: true,
              appVersion: true,
              pairingCode: true, // Include pairingCode to check pairing state
              lastPlaybackReportAt: true,
              playbackReportIsPlaying: true,
              playbackReportState: true,
            },
          });

          console.log('[HEARTBEAT IDENTITY]', {
            deviceId: device.id,
            tenantId: device.tenantId,
            storeId: device.storeId,
            status: device.status,
            lastSeenAt: device.lastSeenAt?.toISOString?.() ?? null,
          });
          
          // Emit device_paired event if this is a pairing transition
          if (isPairingTransition) {
            console.log('[HEARTBEAT] Emitting device_paired event', {
              deviceId: device.id,
              tenantId: device.tenantId,
              storeId: device.storeId,
            });
            
            try {
              // Import emitDeviceEvent if available
              const { emitDeviceEvent, DEVICE_ENGINE_EVENT_TYPES } = await import('../engines/device/deviceEvents.js');
              emitDeviceEvent({
                type: DEVICE_ENGINE_EVENT_TYPES.PAIRING_CLAIMED,
                payload: {
                  deviceId: device.id,
                  tenantId: device.tenantId,
                  storeId: device.storeId,
                  name: device.name,
                  status: device.status,
                  engine: 'DEVICE_V2',
                },
              });
            } catch (eventError) {
              console.error('[HEARTBEAT] Failed to emit device_paired event (non-fatal):', eventError);
            }
            
            // Also emit legacy SSE event
            broadcastSse('admin', 'device:paired', {
              deviceId: device.id,
              name: device.name,
              platform: device.platform || null,
              type: 'screen',
              status: device.status,
              lastSeenAt: device.lastSeenAt?.toISOString() || null,
              tenantId: device.tenantId,
              storeId: device.storeId,
            });
          }
        }
        
        if (isDeviceV2) {
          console.log('[Device Engine] DEVICE v2 heartbeat processed', {
            deviceId,
            status: device.status,
            lastSeenAt: now.toISOString(),
            wasOffline: device.status === 'offline' || device.status === 'OFFLINE',
          });
        }
      } catch (updateError) {
        // If device not found, create it
        if (updateError.code === 'P2025') {
          const tenantId = bodyTenantId || 'temp';
          const storeId = bodyStoreId || 'temp';
          
          device = await prisma.device.create({
            data: {
              id: deviceId,
              tenantId,
              storeId,
              status: 'online', // Always set to 'online' when heartbeat received
              lastSeenAt: now,
              platform: platform || undefined,
              appVersion: engineVersion || undefined,
              name: 'Unnamed Device',
              orientation: 'horizontal', // Default orientation for new devices
              ...(playbackReportPatch || {}),
            },
            select: {
              id: true,
              name: true,
              status: true,
              orientation: true,
              tenantId: true,
              storeId: true,
              lastSeenAt: true,
              platform: true,
              appVersion: true,
              lastPlaybackReportAt: true,
              playbackReportIsPlaying: true,
              playbackReportState: true,
            },
          });
          console.log('[HEARTBEAT] Created device with provided ID', { deviceId, tenantId, storeId, platform, engineVersion });
        } else {
          throw updateError;
        }
    }
  }

    if (IS_DEV && device?.id) {
      const ls =
        device.lastSeenAt instanceof Date
          ? device.lastSeenAt.toISOString()
          : String(device.lastSeenAt || '');
      console.log(`[HEARTBEAT] deviceId=${device.id} updated lastSeenAt=${ls}`);
    }

    // Compute pairingStatus
    let pairingStatus = 'UNPAIRED';
    
    // Check if device has an active DevicePlaylistBinding
    const activeBinding = await prisma.devicePlaylistBinding.findFirst({
      where: {
        deviceId: device.id,
        status: 'ready',
      },
    });

    if (activeBinding) {
      pairingStatus = 'PAIRED_PLAYLIST_ASSIGNED';
    } else if (device.tenantId && device.storeId && 
               device.tenantId !== 'temp' && device.storeId !== 'temp' && 
               !device.pairingCode) {
      // Device is paired (has tenant/store) but no active playlist
      pairingStatus = 'PAIRED_NO_PLAYLIST';
    }

    // Get displayName (prefer name, fallback to "Unnamed Device")
    const displayName = device.name || 'Unnamed Device';

    // Normalize status to "online" | "offline" | "repair_requested" | "repair_in_progress" for response
    // Map "degraded" to "online" (device is still reachable)
    // Preserve repair states so TV knows to show waiting page
    let normalizedStatus;
    if (device.status === 'offline') {
      normalizedStatus = 'offline';
    } else if (device.status === 'repair_requested' || device.status === 'repair_in_progress') {
      normalizedStatus = device.status; // Preserve repair states
    } else {
      normalizedStatus = 'online';
    }

    // Determine repair status for response
    const repairStatus = (device.status === 'repair_requested' || device.status === 'repair_in_progress') 
      ? device.status 
      : null;

    // Get orientation from device (defaults to 'horizontal' if not set)
    const deviceOrientation = device.orientation || 'horizontal';

    const presenceNow = new Date();
    const presenceForSse = computeDevicePresenceWithPlayback(device, presenceNow);
    if (IS_DEV && device?.id) {
      console.log('[PRESENCE_FINAL]', {
        deviceId: device.id,
        lastSeenAt: device.lastSeenAt,
        lastPlaybackReportAt: device.lastPlaybackReportAt,
        playbackReportIsPlaying: device.playbackReportIsPlaying,
        playbackReportState: device.playbackReportState,
        presenceTier: presenceForSse.presenceTier,
      });
    }
    
    // Get pending commands for device (if deviceId is provided)
    let pendingCommands = [];
    if (device.id) {
      try {
        pendingCommands = await getPendingCommandsForDevice(device.id);
        if (pendingCommands.length > 0) {
          // Mark commands as sent (being delivered to device)
          const commandIds = pendingCommands.map(cmd => cmd.id);
          await markCommandsAsSent(commandIds);
          console.log(`[Device Engine] [Heartbeat] Sending ${pendingCommands.length} commands to device ${device.id}`);
        }
      } catch (cmdError) {
        // Log but don't fail heartbeat if command fetch fails
        console.error('[Device Engine] [Heartbeat] Failed to fetch commands:', cmdError);
      }
    }
    
    // Build standardized response
    const response = {
      ok: true,
      deviceId: device.id,
      status: normalizedStatus,
      pairingStatus,
      displayName,
      orientation: deviceOrientation, // Include orientation in heartbeat response
      tenantId: device.tenantId ?? null,
      storeId: device.storeId ?? null,
      ...(repairStatus && { repairStatus }), // Include repair status if in repair state
      ...(pendingCommands.length > 0 && { commands: pendingCommands.map(cmd => ({
        id: cmd.id,
        type: cmd.type,
        payload: cmd.payload || {},
      })) }), // Include commands if any are pending
    };

    // Log heartbeat (enhanced for DEVICE v2)
    if (isDeviceV2) {
      console.log('[Device Engine] DEVICE v2 heartbeat complete', {
        deviceId: device.id,
        status: normalizedStatus,
        pairingStatus,
        displayName,
        lastSeenAt: device.lastSeenAt?.toISOString(),
        platform: device.platform,
        engineVersion: device.appVersion,
        tenantId: device.tenantId,
        storeId: device.storeId,
        commandCount: pendingCommands.length,
        executedCommandCount: executedCommandIds?.length || 0,
        presenceTier: presenceForSse.presenceTier,
      });
    } else {
      console.log('[HEARTBEAT]', {
        deviceId: device.id,
        status: normalizedStatus,
        pairingStatus,
        displayName,
        commandCount: pendingCommands.length,
      });
    }

    await addDeviceLog({
      deviceId: device.id,
      source: 'heartbeat',
      level: 'debug',
      message: 'Heartbeat received',
      payload: {
        status: device.status,
        pairingStatus,
        playbackState: playbackState ?? null,
        playbackReport: body.playbackReport ?? null,
      },
    });

    // Emit "device.status.changed" SSE event to 'admin' key
    // This event is consumed by the dashboard to update device online/offline status
    const ssePayload = {
      deviceId: device.id,
      status: normalizedStatus, // 'online' | 'offline'
      pairingStatus,
      displayName,
      tenantId: device.tenantId,
      storeId: device.storeId,
      lastSeenAt: device.lastSeenAt?.toISOString() || null, // Critical: Dashboard uses this for "last seen X ago"
      timestamp: device.lastSeenAt?.toISOString() || presenceNow.toISOString(),
      engineVersion: device.appVersion || null,
      platform: device.platform || null,
      name: device.name || null,
      model: device.model || null,
      location: device.location || null,
      presenceTier: presenceForSse.presenceTier,
      isOnline: presenceForSse.isOnline,
      playbackReported: presenceForSse.playbackReported,
      lastPlaybackReportAt: device.lastPlaybackReportAt?.toISOString?.() ?? null,
      playbackReportIsPlaying: device.playbackReportIsPlaying ?? null,
      playbackReportState: device.playbackReportState ?? null,
    };

    broadcastSse(
      'admin',
      'device.status.changed',
      ssePayload
    );
    
    // Also emit device:update for backward compatibility
    broadcastSse(
      'admin',
      'device:update',
      ssePayload
    );

    // Also broadcast playlist progress if available (for backward compatibility)
    if (playbackState?.playlistId) {
      broadcastSse(
        'admin',
        'device:playlistProgress',
        {
          deviceId: device.id,
          playlistId: playbackState.playlistId,
          currentIndex: playbackState.currentIndex ?? 0,
          totalItems: playbackState.totalItems ?? null,
          progressSeconds: playbackState.progressSeconds ?? null,
          currentItemId: playbackState.currentItemId ?? null,
          at: new Date().toISOString(),
        }
      );
    }

    // Handle optional alert payload (piggyback on heartbeat)
    // This allows devices to batch alerts with heartbeats when connection recovers
    if (alertPayload && typeof alertPayload === 'object') {
      try {
        const alertType = alertPayload.type || 'connection_error';
        const alertMessage = alertPayload.message || 'Device reported an issue';

        // Create alert record
        const alert = await prisma.deviceAlert.create({
          data: {
            deviceId: device.id,
            type: alertType,
            reason: alertType,
            status: 'pending',
            message: alertMessage,
            deviceType: device.type || null,
            ip: req.ip || null,
            engineVersion: engineVersion || null,
            env: process.env.NODE_ENV || null,
            resolved: false,
          },
        });

        console.log('[Device Engine] Alert created via heartbeat', {
          alertId: alert.id,
          deviceId: device.id,
          type: alertType,
        });

        // Update device status to "degraded" if it's a connection error
        if (alertType === 'connection_error' && device.status !== 'degraded') {
          try {
            await prisma.device.update({
              where: { id: device.id },
              data: { status: 'degraded' },
            });
            console.log('[Device Engine] Updated device status to degraded via heartbeat', {
              deviceId: device.id,
            });
          } catch (updateError) {
            console.warn('[Device Engine] Failed to update device status', {
              deviceId: device.id,
              error: updateError.message,
            });
          }
        }

        // Emit SSE/WebSocket event for dashboard
        const eventPayload = {
          id: alert.id,
          deviceId: alert.deviceId,
          type: alert.type,
          status: alert.status,
          reason: alert.reason,
          message: alert.message,
          createdAt: alert.createdAt.toISOString(),
          ...(alert.engineVersion && { engineVersion: alert.engineVersion }),
          ...(alert.env && { env: alert.env }),
        };

        broadcastSse('admin', 'device:alert', eventPayload);
        console.log('[Device Engine] Broadcast device:alert event via heartbeat', {
          alertId: alert.id,
          deviceId: device.id,
        });

        // Also log as device log
        await addDeviceLog({
          deviceId: device.id,
          source: 'system',
          level: 'warn',
          message: `Alert raised via heartbeat: ${alertType} - ${alertMessage}`,
          payload: {
            alertId: alert.id,
            type: alert.type,
            reason: alert.reason,
            status: alert.status,
            engineVersion: alert.engineVersion,
            env: alert.env,
          },
        });
      } catch (alertError) {
        // Log but don't fail the heartbeat request
        console.error('[Device Engine] Failed to process alert in heartbeat', {
          deviceId: device.id,
          error: alertError.message,
        });
      }
    }

    res.json(response);
  } catch (error) {
    console.error('[Device Engine] Heartbeat error:', error);
    
    // Return 500 for internal errors
    res.status(500).json({
      ok: false,
      error: 'internal_error',
    });
  }
});

/**
 * POST /api/device/confirm-playlist-ready
 * Confirm that a device has successfully loaded a playlist (Device-initiated, no auth required)
 */
/**
 * GET /api/device/:id/status
 * Get device heartbeat status and diagnostic info
 * Used for troubleshooting device connectivity issues
 */
router.get('/:id/status', async (req, res) => {
  try {
    const { id: deviceId } = req.params;

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        appVersion: true,
        platform: true,
        tenantId: true,
        storeId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!device) {
      return res.status(404).json({
        ok: false,
        error: 'Device not found',
      });
    }

    const now = new Date();
    const timeSinceLastSeen = device.lastSeenAt
      ? now.getTime() - new Date(device.lastSeenAt).getTime()
      : null;
    const minutesAgo = timeSinceLastSeen ? Math.round(timeSinceLastSeen / 60000) : null;
    const isOnline = timeSinceLastSeen ? timeSinceLastSeen < 5 * 60 * 1000 : false;

    res.json({
      ok: true,
      data: {
        device: {
          id: device.id,
          name: device.name,
          status: device.status,
          platform: device.platform,
          appVersion: device.appVersion,
          tenantId: device.tenantId,
          storeId: device.storeId,
        },
        heartbeat: {
          lastSeenAt: device.lastSeenAt?.toISOString() || null,
          minutesAgo,
          isOnline,
          expectedInterval: '30 seconds',
          offlineThreshold: '5 minutes',
        },
        diagnostic: {
          issue: !device.lastSeenAt
            ? 'Device has never sent a heartbeat'
            : !isOnline
            ? `Device last seen ${minutesAgo} minutes ago - appears offline`
            : 'Device is online and sending heartbeats',
          recommendation: !device.lastSeenAt
            ? 'Check if the tablet app is running and configured with the correct API URL'
            : !isOnline
            ? 'Check tablet app, network connectivity, and API URL configuration'
            : 'No action needed',
        },
      },
    });
  } catch (error) {
    console.error('[device/:id/status] Error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to get device status',
    });
  }
});

router.post('/confirm-playlist-ready', async (req, res) => {
  try {
    console.log('[Device Engine] POST /api/device/confirm-playlist-ready', { body: req.body });

    const parsed = ConfirmPlaylistReadyInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        issues: parsed.error.issues,
      });
    }

    const input = parsed.data;
    const result = await confirmPlaylistReady(input, createEngineContext());

    res.json(result);
  } catch (error) {
    console.error('[Device Engine] Confirm playlist ready error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to confirm playlist ready',
    });
  }
});

/**
 * POST /api/device/trigger-repair
 * Trigger repair actions for a device (Server-side only, requires auth)
 */
router.post('/trigger-repair', requireAuth, async (req, res) => {
  try {
    console.log('[Device Engine] POST /api/device/trigger-repair', { body: req.body });

    const parsed = TriggerRepairInput.safeParse(req.body);
    if (!parsed.success) {
      console.error('[Device Engine] Trigger repair validation error:', {
        body: req.body,
        issues: parsed.error.issues,
      });
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        issues: parsed.error.issues,
      });
    }

    const { deviceId, repairType } = parsed.data;

    // Look up device to get tenantId and storeId
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: { tenantId: true, storeId: true },
    });

    if (!device) {
      return res.status(404).json({
        ok: false,
        error: 'Device not found',
      });
    }

    // Build input with tenantId/storeId from device
    const input = {
      tenantId: device.tenantId,
      storeId: device.storeId,
      deviceId,
      repairType: repairType || 'full_reset',
    };

    const result = await triggerRepair(input, createEngineContext());

    res.json(result);
  } catch (error) {
    console.error('[Device Engine] Trigger repair error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to trigger repair',
    });
  }
});

/**
 * POST /api/device/:deviceId/command
 * Queue a command for a device (Dashboard-initiated, requires auth)
 * RESTful endpoint with deviceId in URL path
 * 
 * Body: { 
 *   type: "play" | "pause" | "next" | "previous" | "reload",
 *   payload?: { ...optional... }
 * }
 * 
 * Response: {
 *   ok: true,
 *   commandId: string,
 *   status: "queued"
 * }
 */
router.post('/:deviceId/command', requireAuth, async (req, res) => {
  try {
    let { deviceId } = req.params;
    const { type, payload } = req.body;

    // Get tenantId from authenticated user
    const tenantId = req.userId || req.user?.tenantId || req.user?.business?.id;
    
    if (!tenantId) {
      return res.status(401).json({
        ok: false,
        error: 'unauthorized',
        message: 'Unable to determine tenantId',
      });
    }

    // Validate command type
    const validTypes = ['play', 'pause', 'next', 'previous', 'reload'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_command_type',
        message: `Invalid command type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    // First, try to find device by deviceId
    let device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        tenantId: true,
        name: true,
      },
    });

    // If not found as Device, try to find as Screen and map to Device
    if (!device) {
      const screen = await prisma.screen.findUnique({
        where: { id: deviceId },
        select: {
          id: true,
          name: true,
          location: true,
        },
      });

      if (!screen) {
        return res.status(404).json({
          ok: false,
          error: 'screen_not_found',
          message: 'Screen or device not found',
        });
      }

      // Try to find Device by matching name or location
      const screenWhere = {
        tenantId,
        OR: [],
      };

      if (screen.name) {
        screenWhere.OR.push({ name: screen.name });
      }
      if (screen.location) {
        screenWhere.OR.push({ location: screen.location });
      }

      if (screenWhere.OR.length > 0) {
        device = await prisma.device.findFirst({
          where: screenWhere,
          select: {
            id: true,
            tenantId: true,
            name: true,
          },
        });
      }

      if (!device) {
        return res.status(404).json({
          ok: false,
          error: 'screen_not_found',
          message: 'Screen found but no associated device found. Please pair the screen with a device first.',
        });
      }

      // Update deviceId to the found device
      deviceId = device.id;
    }

    if (device.tenantId !== tenantId) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'Device does not belong to your tenant',
      });
    }

    // Queue the command
    const cmd = await enqueueDeviceCommand(deviceId, type, payload ?? {});

    console.log('[Device Engine] Queued command', { deviceId, type, commandId: cmd.id });

    // Log command queued
    await addDeviceLog({
      deviceId,
      source: 'command',
      level: 'info',
      message: `Command queued: ${type}`,
      payload: payload ?? {},
    });

    // Broadcast SSE event: "device.command.queued"
    broadcastSse(
      device.tenantId,
      'device.command.queued',
      {
        deviceId,
        commandId: cmd.id,
        type,
        payload: payload ?? {},
        at: new Date().toISOString(),
      }
    );

    // Also broadcast via websocket for real-time updates
    broadcastWebsocket(device.tenantId, {
      event: 'device.command.queued',
      deviceId,
      commandId: cmd.id,
      type,
      payload: payload ?? {},
    });

    res.json({
      ok: true,
      commandId: cmd.id,
      status: 'queued',
    });
  } catch (error) {
    console.error('[Device Engine] Command error:', error);
    res.status(500).json({
      ok: false,
      error: 'server_error',
      message: error.message || 'Failed to queue command',
    });
  }
});

// Duplicate route removed - see route at line 1174 for the implementation with screen ID support

/**
 * POST /api/device/command
 * Queue a command for a device (Dashboard-initiated, requires auth)
 * Legacy endpoint - deviceId in body (kept for backward compatibility)
 * 
 * Body: { 
 *   deviceId: string, 
 *   type: "play" | "pause" | "next" | "previous" | "reloadPlaylist" | "setPlaylistIndex" | "setVolume" | "setBrightness" | "screenshot",
 *   payload?: { index?: number, volume?: number, brightness?: number }
 * }
 */
router.post('/command', requireAuth, async (req, res) => {
  try {
    const { deviceId, type, payload } = req.body;

    // Basic validation
    if (!deviceId || !type) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_input',
        message: 'deviceId and type are required',
      });
    }

    const validTypes = [
      'play', 
      'pause', 
      'next', 
      'previous', 
      'reloadPlaylist', 
      'setPlaylistIndex',
      'setVolume',
      'setBrightness',
      'screenshot',
    ];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_command_type',
        message: `Invalid command type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    // Verify device exists
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true },
    });

    if (!device) {
      return res.status(404).json({
        ok: false,
        error: 'device_not_found',
      });
    }

    const cmd = await enqueueDeviceCommand(deviceId, type, payload ?? {});

    console.log('[Device Engine] Queued command', { deviceId, type, id: cmd.id });

    // Log command queued
    await addDeviceLog({
      deviceId,
      source: 'command',
      level: 'info',
      message: `Command queued: ${type}`,
      payload: payload ?? {},
    });

    // Broadcast command queued
    broadcastSse(
      'admin',
      'device:commandQueued',
      {
        deviceId,
        type,
        payload: payload ?? {},
        at: new Date().toISOString(),
      }
    );

    res.json({
      ok: true,
      id: cmd.id,
    });
  } catch (error) {
    console.error('[Device Engine] Command error:', error);
    res.status(500).json({
      ok: false,
      error: 'server_error',
      message: error.message || 'Failed to queue command',
    });
  }
});

/**
 * POST /api/device/:deviceId/commands
 * Queue a command for a device (Server-side only, requires auth)
 * Legacy endpoint - kept for backward compatibility
 * 
 * Body: { type: "reload" | "next" | "prev" | "pause" | "resume" | "repair" | "setBrightness", payload?: object }
 */
router.post('/:deviceId/commands', requireAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { type, payload } = req.body;

    if (!type) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required field: type',
      });
    }

    const validTypes = ['reload', 'next', 'prev', 'pause', 'resume', 'repair', 'setBrightness'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid command type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    const { queueCommand } = await import('../engines/device/commandQueue.js');
    const command = await queueCommand(deviceId, type, payload || {});

    res.json({
      ok: true,
      command,
    });
  } catch (error) {
    console.error('[Device Engine] Queue command error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to queue command',
    });
  }
});

/**
 * POST /api/device/push-playlist
 * Assign playlist to device (Dashboard-initiated, requires auth)
 * Simplified endpoint that takes deviceId and playlistId, fetches playlist data, and pushes it
 */
router.post('/push-playlist', requireAuth, async (req, res) => {
  try {
    console.log('[Device Engine] POST /api/device/push-playlist', { body: req.body });

    const deviceId =
      typeof req.body.deviceId === 'string'
        ? req.body.deviceId.trim()
        : String(req.body.deviceId ?? '').trim();
    const playlistId =
      typeof req.body.playlistId === 'string'
        ? req.body.playlistId.trim()
        : String(req.body.playlistId ?? '').trim();

    if (!deviceId || !playlistId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields',
        message: 'deviceId and playlistId are required',
      });
    }

    const { runDashboardPlaylistPush } = await import('../services/dashboardPlaylistPushService.js');
    const result = await runDashboardPlaylistPush({
      deviceId,
      playlistId,
      userId: req.userId,
    });

    res.json(result);
  } catch (error) {
    console.error('[Device Engine] Push playlist error:', error);
    const code = error?.code;
    if (code === 'DEVICE_NOT_FOUND') {
      return res.status(404).json({
        ok: false,
        error: 'Device not found',
      });
    }
    if (code === 'PLAYLIST_NOT_FOUND') {
      return res.status(404).json({
        ok: false,
        error: 'Playlist not found',
      });
    }
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to push playlist',
    });
  }
});

/**
 * POST /api/device/unassign-playlist
 * Unassign/clear playlist from device (Dashboard-initiated, requires auth)
 * Removes all playlist bindings for the device
 */
router.post('/unassign-playlist', requireAuth, async (req, res) => {
  try {
    console.log('[Device Engine] POST /api/device/unassign-playlist', { body: req.body });

    const deviceId =
      typeof req.body.deviceId === 'string'
        ? req.body.deviceId.trim()
        : String(req.body.deviceId ?? '').trim();

    if (!deviceId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required field',
        message: 'deviceId is required',
      });
    }

    // Get device to verify it exists and get tenant/store info
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
      return res.status(404).json({
        ok: false,
        error: 'Device not found',
      });
    }

    // Get all active bindings for this device
    const bindings = await prisma.devicePlaylistBinding.findMany({
      where: {
        deviceId,
        status: { in: ['ready', 'pending'] }, // Only remove active bindings
      },
    });

    // Delete all bindings (or mark as cancelled if you want to keep history)
    if (bindings.length > 0) {
      await prisma.devicePlaylistBinding.deleteMany({
        where: {
          deviceId,
          status: { in: ['ready', 'pending'] },
        },
      });

      console.log(`[Device Engine] Removed ${bindings.length} playlist binding(s) for device ${deviceId}`);
    }

    // Log playlist unassignment
    await addDeviceLog({
      deviceId,
      source: 'playlist',
      level: 'info',
      message: 'Playlist unassigned',
      payload: { bindingsRemoved: bindings.length },
    });

    // Log activity event (if service exists)
    try {
      const activityService = await import('../services/activityEventService.js');
      // Use logPlaylistAssigned with null playlistId to indicate unassignment
      if (activityService.logPlaylistAssigned) {
        await activityService.logPlaylistAssigned({
          deviceId,
          playlistId: null, // null indicates unassignment
          tenantId: device.tenantId,
          storeId: device.storeId,
          userId: req.userId,
          metadata: {
            action: 'unassigned',
            bindingsRemoved: bindings.length,
          },
        });
      }
    } catch (logError) {
      console.warn('[Device Engine] Failed to log activity event (non-fatal):', logError.message);
    }

    // Broadcast playlist unassignment
    broadcastSse(
      'admin',
      'device:playlistUnassigned',
      {
        deviceId,
        playlistId: null,
        at: new Date().toISOString(),
      }
    );

    res.json({
      ok: true,
      deviceId,
      bindingsRemoved: bindings.length,
      message: `Unassigned playlist from device (removed ${bindings.length} binding(s))`,
    });
  } catch (error) {
    console.error('[Device Engine] Unassign playlist error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to unassign playlist',
    });
  }
});

/**
 * POST /api/device/screenshot
 * Upload screenshot from device (Device-initiated, no auth required)
 * 
 * Body: { deviceId: string, imageBase64: string }
 */
router.post('/screenshot', async (req, res) => {
  try {
    const { deviceId, imageBase64 } = req.body;

    if (!deviceId || !imageBase64) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_input',
        message: 'deviceId and imageBase64 are required',
      });
    }

    // Verify device exists
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true },
    });

    if (!device) {
      return res.status(404).json({
        ok: false,
        error: 'device_not_found',
      });
    }

    // Update device with screenshot
    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: {
        lastScreenshotBase64: imageBase64,
        lastScreenshotAt: new Date(),
      },
    });

    console.log('[Device Engine] Screenshot uploaded', { deviceId });

    // Emit SSE event for screenshot (A.4)
    broadcastSse('admin', 'device:screenshot', {
      deviceId,
      lastScreenshotBase64: imageBase64,
      lastScreenshotAt: updated.lastScreenshotAt?.getTime() || Date.now(),
    });

    res.json({
      ok: true,
    });
  } catch (error) {
    console.error('[Device Engine] Screenshot error:', error);
    res.status(500).json({
      ok: false,
      error: 'server_error',
      message: error.message || 'Failed to save screenshot',
    });
  }
});

/**
 * GET /api/device/pair-status/:sessionId
 * Check pairing status for DeviceEngine V2 session
 * Used by tablets to poll pairing status
 * 
 * Response:
 *   - pending: { ok: true, status: "pending", sessionId: "...", pairingCode: "ABC123", deviceId: null, expiresAt: "...", ttlLeftMs: number }
 *   - claimed: { ok: true, status: "claimed", sessionId: "...", deviceId: "...", expiresAt: "...", ttlLeftMs: 0 }
 *   - expired: { ok: true, status: "expired", sessionId: "...", deviceId: null, expiresAt: "...", ttlLeftMs: 0 }
 */
router.get('/pair-status/:sessionId', async (req, res) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim();
    
    if (!sessionId) {
      return res.status(400).json({
        ok: false,
        error: 'sessionId_required',
        message: 'sessionId is required',
      });
    }
    
    console.log(`[DeviceEngine V2] GET /api/device/pair-status/${sessionId}`);
    
    // Find device by sessionId (device ID acts as session ID in DeviceEngine V2)
    const device = await prisma.device.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        pairingCode: true,
        tenantId: true,
        storeId: true,
        createdAt: true,
        status: true,
      },
    });
    
    if (!device) {
      return res.status(404).json({
        ok: false,
        error: 'session_not_found',
        message: 'Pairing session not found',
      });
    }
    
    // Check if pairing code has expired (10 minutes)
    const now = new Date();
    const createdAt = device.createdAt;
    const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000);
    const expired = now > expiresAt;
    
    // Determine status
    // Priority order:
    // 1. If expired and still has pairing code -> expired
    // 2. If pairing code is cleared AND tenant/store are real (not 'temp') -> claimed
    // 3. If has pairing code AND tenant/store are temp -> pending
    // 4. Otherwise -> pending (fallback)
    let status;
    const hasPairingCode = !!device.pairingCode;
    const isTempTenant = device.tenantId === 'temp' || device.storeId === 'temp';
    const isPaired = !hasPairingCode && !isTempTenant;
    
    if (expired && hasPairingCode) {
      status = 'expired';
    } else if (isPaired) {
      // Device is claimed/paired: no pairing code and real tenant/store
      status = 'claimed';
    } else if (hasPairingCode && isTempTenant) {
      // Device is waiting: has pairing code and temp tenant/store
      status = 'pending';
    } else {
      // Fallback: treat as pending
      status = 'pending';
    }
    
    console.log(`[DeviceEngine V2] pair-status response:`, {
      sessionId,
      status,
      deviceId: status === 'claimed' ? device.id : null,
      expired,
      hasPairingCode: !!device.pairingCode,
      tenantId: device.tenantId,
      storeId: device.storeId,
    });
    
    // Build response according to spec
    const response = {
      ok: true,
      status,
      sessionId, // Include sessionId for consistency
      engine: 'DEVICE_V2',
      expiresAt: expiresAt.toISOString(),
      ttlLeftMs: Math.max(0, expiresAt.getTime() - now.getTime()),
    };
    
    // Include pairingCode when status is 'pending' (app needs it to display pairing screen)
    if (status === 'pending' && device.pairingCode) {
      response.pairingCode = device.pairingCode;
    }
    
    // Only include deviceId when status is 'claimed'
    if (status === 'claimed') {
      response.deviceId = device.id;
    }
    
    return res.json(response);
  } catch (error) {
    console.error('[DeviceEngine V2] pair-status error:', error);
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: error.message || 'Failed to check pairing status',
    });
  }
});

// Handle malformed pair-status requests (legacy path)
router.get('/pair-status/:deviceId/*', async (req, res) => {
  console.warn('[Device Engine] Malformed pair-status request:', req.originalUrl);
  return res.status(404).json({
    ok: false,
    error: 'endpoint_not_found',
    message: 'The /api/device/pair-status/:deviceId/* endpoint does not exist. Use GET /api/device/pair-status/:sessionId instead.',
    deprecated: true,
  });
});

/**
 * POST /api/device/claim
 * Claim a Device V2 pairing session (Dashboard-initiated, requires auth)
 * 
 * Request body:
 *   {
 *     sessionId: string,  // Device ID from pairing request
 *     code: string,       // Pairing code
 *     tenantId: string,  // Optional, can come from auth context
 *     storeId: string,    // Optional, can come from auth context
 *     name?: string,      // Optional device name
 *     location?: string   // Optional device location
 *   }
 * 
 * Success response (200):
 *   {
 *     ok: true,
 *     deviceId: string
 *   }
 * 
 * Error responses:
 *   - 400: { ok: false, error: 'missing_fields', message: string }
 *   - 400: { ok: false, error: 'invalid_code', message: string }
 *   - 404: { ok: false, error: 'session_not_found', message: string }
 *   - 500: { ok: false, error: 'claim_failed', message: string }
 */
router.post('/claim', requireAuth, async (req, res) => {
  const requestId = Math.random().toString(36).slice(2, 9);
  
  try {
    console.log(`[DeviceEngine V2] [${requestId}] Claim request received`, {
      body: req.body,
      user: req.user?.id,
    });

    const { sessionId, code, tenantId, storeId, name, location } = req.body;

    // Validate required fields
    if (!sessionId || !code) {
      console.warn(`[DeviceEngine V2] [${requestId}] Missing required fields`, {
        hasSessionId: !!sessionId,
        hasCode: !!code,
      });
      
      return res.status(400).json({
        ok: false,
        error: 'missing_fields',
        message: 'sessionId and code are required',
      });
    }

    // Get tenantId and storeId (prefer authenticated dashboard context when present)
    const finalTenantId =
      req.user?.id ||
      tenantId ||
      req.query?.tenantId ||
      req.user?.business?.tenantId ||
      req.workspace?.tenantId;
    const finalStoreId =
      storeId ||
      req.query?.storeId ||
      req.user?.business?.storeId ||
      req.workspace?.storeId;

    if (!finalTenantId || !finalStoreId) {
      console.warn(`[DeviceEngine V2] [${requestId}] Missing tenantId or storeId`, {
        hasTenantId: !!finalTenantId,
        hasStoreId: !!finalStoreId,
      });
      
      return res.status(400).json({
        ok: false,
        error: 'missing_fields',
        message: 'tenantId and storeId are required (can come from auth context)',
      });
    }

    console.log(`[DeviceEngine V2] [${requestId}] Claiming pairing session`, {
      sessionId,
      code: code.toUpperCase(),
      tenantId: finalTenantId,
      storeId: finalStoreId,
    });

    // Normalize code (uppercase, trim)
    const normalizedCode = String(code || '').trim().toUpperCase();

    // Find device by sessionId (device ID) and verify pairing code matches
    const device = await prisma.device.findUnique({
      where: { id: sessionId },
    });

    if (!device) {
      console.warn(`[DeviceEngine V2] [${requestId}] Device not found`, { sessionId });
      
      return res.status(404).json({
        ok: false,
        error: 'session_not_found',
        message: 'Pairing session not found',
      });
    }

    // Verify pairing code matches
    if (!device.pairingCode || device.pairingCode.toUpperCase() !== normalizedCode) {
      console.warn(`[DeviceEngine V2] [${requestId}] Invalid pairing code`, {
        sessionId,
        expected: device.pairingCode,
        received: normalizedCode,
      });
      
      return res.status(400).json({
        ok: false,
        error: 'invalid_code',
        message: 'Pairing code does not match',
      });
    }

    // Check if pairing code has expired (10 minutes)
    const createdAt = device.createdAt;
    const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000);
    const now = new Date();

    if (now > expiresAt) {
      console.warn(`[DeviceEngine V2] [${requestId}] Pairing code expired`, {
        sessionId,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        now: now.toISOString(),
      });
      
      return res.status(400).json({
        ok: false,
        error: 'code_expired',
        message: 'Pairing code has expired',
      });
    }

    // Check if already paired (has real tenantId/storeId, not 'temp')
    if (device.tenantId !== 'temp' && device.storeId !== 'temp') {
      console.warn(`[DeviceEngine V2] [${requestId}] Device already paired`, {
        sessionId,
        tenantId: device.tenantId,
        storeId: device.storeId,
      });

      // Reject mismatched pairing: if already assigned to a different store than selected.
      if (finalStoreId && device.storeId !== finalStoreId) {
        return res.status(400).json({
          ok: false,
          error: 'store_mismatch',
          message: 'Device already assigned to another store',
        });
      }

      // Return success (idempotent) when it matches the selected store
      return res.json({ ok: true, deviceId: device.id, alreadyPaired: true });
    }

    console.log(`[DeviceEngine V2] [${requestId}] Updating device with tenant/store info`);

    // Update device with tenant/store info and clear pairing code
    const updated = await prisma.device.update({
      where: { id: device.id },
      data: {
        tenantId: finalTenantId,
        storeId: finalStoreId,
        name: name || device.name || null,
        location: location || device.location || null,
        pairingCode: null, // Clear pairing code after successful claim
        status: 'online',
        lastSeenAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        tenantId: true,
        storeId: true,
        status: true,
      },
    });

    console.log(`[DeviceEngine V2] [${requestId}] Device updated`, {
      deviceId: updated.id,
      tenantId: updated.tenantId,
      storeId: updated.storeId,
    });

    // Emit Device V2 pairing claimed event
    try {
      const { emitDeviceEvent, DEVICE_ENGINE_EVENT_TYPES } = await import('../engines/device/deviceEvents.js');
      emitDeviceEvent({
        type: DEVICE_ENGINE_EVENT_TYPES.PAIRING_CLAIMED,
        payload: {
          sessionId: updated.id,
          deviceId: updated.id,
          tenantId: updated.tenantId,
          storeId: updated.storeId,
        },
      });
      console.log(`[DeviceEngine V2] [${requestId}] Device V2 event emitted: device.pairing.claimed`);
    } catch (eventError) {
      // Don't fail claim if event emission fails
      console.warn(`[DeviceEngine V2] [${requestId}] Failed to emit Device V2 event (non-fatal):`, eventError.message);
    }

    // Also emit legacy event for backward compatibility
    try {
      const { getEventEmitter, DEVICE_EVENTS } = await import('../engines/device/events.js');
      const events = getEventEmitter();
      await events.emit(DEVICE_EVENTS.PAIRED, {
        tenantId: updated.tenantId,
        storeId: updated.storeId,
        deviceId: updated.id,
        status: updated.status,
      });
      console.log(`[DeviceEngine V2] [${requestId}] Legacy event emitted: PAIRED`);
    } catch (eventError) {
      console.warn(`[DeviceEngine V2] [${requestId}] Failed to emit legacy event (non-fatal):`, eventError.message);
    }

    // Return success response
    res.json({
      ok: true,
      deviceId: updated.id,
    });
  } catch (error) {
    // Log detailed error for server debugging
    console.error(`[DeviceEngine V2] [${requestId}] Claim ERROR`, {
      message: error?.message,
      name: error?.name,
      code: error?.code,
      stack: error?.stack,
      cause: error?.cause,
    });

    // Return structured error response
    res.status(500).json({
      ok: false,
      error: 'claim_failed',
      message: 'Failed to claim pair session due to an internal error.',
    });
  }
});

/**
 * GET /api/device/:deviceId/playlist/full
 * Get full playlist for device (APK-compatible format)
 * Returns flattened, playable items optimized for the Android player
 * 
 * Response:
 *   - ok: true
 *   - deviceId: string
 *   - playlist: { id, name, items: [...] } | null
 *   - items format: { id, type, url, durationMs, order }
 */
router.get('/:deviceId/playlist/full', async (req, res) => {
  const requestId = Math.random().toString(36).slice(2, 9);
  
  try {
    const rawDeviceId = req.params.deviceId;
    const normalizedDeviceId =
      typeof rawDeviceId === 'string' ? rawDeviceId.trim() : String(rawDeviceId ?? '').trim();
    
    if (!normalizedDeviceId) {
      return res.status(400).json({
        ok: false,
        error: 'deviceId_required',
        message: 'deviceId is required',
      });
    }
    
    console.log(`[Device Engine] [${requestId}] GET /api/device/${normalizedDeviceId}/playlist/full`, {
      deviceIdParamRaw: rawDeviceId,
      deviceIdNormalized: normalizedDeviceId,
    });
    
    // Verify device exists and get device details (lookup by trimmed id)
    const device = await prisma.device.findUnique({
      where: { id: normalizedDeviceId },
      select: {
        id: true,
        tenantId: true,
        storeId: true,
        name: true,
        location: true,
        orientation: true, // Device orientation field
      },
    });
    
    if (!device) {
      console.log(`[Device Engine] [${requestId}] Device not found after normalize`, {
        deviceIdParamRaw: rawDeviceId,
        deviceIdNormalized: normalizedDeviceId,
      });
      return res.status(404).json({
        ok: false,
        error: 'device_not_found',
        message: 'Device not found',
      });
    }

    const canonicalDeviceId = device.id;

    // Best-effort: treat playlist polling as presence signal.
    // Some clients may call playlist/full regularly but not send POST /api/device/heartbeat.
    // If we don't update lastSeenAt here, dashboards will mark the device offline despite active polling.
    const presenceNow = new Date();
    try {
      await prisma.device.update({
        where: { id: canonicalDeviceId },
        data: { lastSeenAt: presenceNow },
        select: { id: true },
      });
    } catch (presenceErr) {
      // Non-fatal: playlist/full should still return even if presence update fails.
      console.warn(`[Device Engine] [${requestId}] Failed to update lastSeenAt from playlist/full (non-fatal)`, {
        deviceId: canonicalDeviceId,
        error: presenceErr?.message || String(presenceErr),
      });
    }
    
    // Single query: all bindings for this device, newest first — then pick first active status (case-insensitive).
    // This avoids mismatches when DB has non-lowercase status or when findFirst+filter disagreed with diagnostics.
    const allBindings = await prisma.devicePlaylistBinding.findMany({
      where: { deviceId: canonicalDeviceId },
      select: {
        id: true,
        playlistId: true,
        status: true,
        lastPushedAt: true,
        version: true,
      },
      orderBy: { lastPushedAt: 'desc' },
    });

    const latestBinding =
      allBindings.find((b) => isActivePlaylistBindingStatus(b.status)) || null;

    console.log(`[Device Engine] [${requestId}] playlist/full binding resolution`, {
      deviceIdReceived: rawDeviceId,
      deviceIdNormalized: normalizedDeviceId,
      canonicalDeviceId,
      bindingQueryRowCount: allBindings.length,
      bindingRows: allBindings.map((b) => ({
        id: b.id,
        status: b.status,
        playlistId: b.playlistId,
        lastPushedAt: b.lastPushedAt,
      })),
      pickedBindingId: latestBinding?.id ?? null,
      pickedBindingStatus: latestBinding?.status ?? null,
      pickedBindingPlaylistId: latestBinding?.playlistId ?? null,
      responseState: latestBinding ? 'has_active_binding' : 'no_binding',
    });
    
    // Determine playlist state
    let state;
    let message;
    
    if (!latestBinding) {
      // No binding exists - device is paired but no playlist assigned
      state = 'no_binding';
      message = 'No playlist assigned to this device';
      
      console.warn(`[Device Engine] [${requestId}] No active playlist for device`, {
        canonicalDeviceId,
        tenantId: device.tenantId,
        storeId: device.storeId,
        totalBindings: allBindings.length,
        bindingStatuses: allBindings.map(b => b.status),
        state,
      });
      
      return res.json({
        ok: true,
        deviceId: canonicalDeviceId,
        state,
        message,
        playlist: null,
      });
    }
    
    // Binding exists — status is active (pending/ready); compare case-insensitively
    const bindingSt = String(latestBinding.status || '').trim().toLowerCase();
    if (bindingSt === 'pending') {
      state = 'pending_binding';
      message = 'Playlist assignment pending - waiting for device confirmation';
    } else {
      state = 'ready';
      message = 'Playlist ready for playback';
    }
    
    // Fetch playlist bound to device (SIGNAGE uses SignageAsset; MEDIA uses Media — same DevicePlaylistBinding row)
    const playlist = await prisma.playlist.findUnique({
      where: { id: latestBinding.playlistId },
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
      console.log(`[Device Engine] [${requestId}] Playlist ${latestBinding.playlistId} not found`);
      return res.json({
        ok: true,
        deviceId: canonicalDeviceId,
        state: 'no_binding',
        message: `Playlist ${latestBinding.playlistId} not found`,
        playlist: null,
      });
    }

    const playlistTypeUpper = String(playlist.type || '').toUpperCase();

    /** @param {string} itemUrl @param {object} logCtx */
    const resolveItemUrl = (itemUrl, logCtx) => {
      const resolvedUrl = buildMediaUrl(itemUrl, req);
      if (!resolvedUrl || (!resolvedUrl.startsWith('http://') && !resolvedUrl.startsWith('https://'))) {
        console.error(`[Device Engine] [${requestId}] Failed to build media URL - malformed result:`, {
          ...logCtx,
          originalUrl: itemUrl,
          resolvedUrl,
          hasReq: !!req,
        });
        return null;
      }
      try {
        new URL(resolvedUrl);
      } catch (urlError) {
        console.error(`[Device Engine] [${requestId}] Built URL is invalid format:`, {
          ...logCtx,
          originalUrl: itemUrl,
          resolvedUrl,
          error: urlError.message,
        });
        return null;
      }
      return resolvedUrl;
    };

    let itemsWithRefs = [];

    if (playlistTypeUpper === 'SIGNAGE') {
      itemsWithRefs = playlist.items
        .map((item) => {
          if (!item.assetId || !item.asset) {
            console.warn(`[Device Engine] [${requestId}] PlaylistItem ${item.id} missing assetId or asset relation`);
            return null;
          }

          const asset = item.asset;
          const itemType = asset.type || 'image';
          const itemUrl = asset.url;
          const durationS = item.durationS || asset.durationS || 8;

          if (!itemUrl || itemUrl.trim() === '') {
            console.warn(`[Device Engine] [${requestId}] SignageAsset ${asset.id} has no URL`);
            return null;
          }

          const resolvedUrl = resolveItemUrl(itemUrl, {
            itemId: item.id,
            assetId: asset.id,
          });
          if (!resolvedUrl) return null;

          console.log(`[Device Playlist] Built item URL`, {
            deviceId: canonicalDeviceId,
            playlistId: playlist.id,
            itemId: item.id,
            assetId: asset.id,
            originalUrl: itemUrl,
            resolvedUrl,
            isCloudFront: isCloudFrontUrl(resolvedUrl),
          });

          const durationMs = Math.max(1000, Math.round(durationS * 1000));

          return {
            id: item.id,
            type: itemType,
            url: resolvedUrl,
            durationMs,
            order: item.orderIndex ?? 0,
            _playlistItem: item,
            _asset: asset,
          };
        })
        .filter(Boolean);
    } else if (playlistTypeUpper === 'MEDIA') {
      itemsWithRefs = playlist.items
        .map((item) => {
          if (!item.mediaId || !item.media) {
            console.warn(`[Device Engine] [${requestId}] PlaylistItem ${item.id} missing mediaId or media relation`);
            return null;
          }

          const media = item.media;
          const kind = String(media.kind || 'IMAGE').toLowerCase();
          const itemType = kind === 'video' ? 'video' : 'image';

          let itemUrl = media.url || '';
          if (kind === 'video' && media.optimizedUrl && media.isOptimized === true) {
            itemUrl = media.optimizedUrl;
          }

          const durationS = item.durationS ?? media.durationS ?? 8;

          if (!itemUrl || itemUrl.trim() === '') {
            console.warn(`[Device Engine] [${requestId}] Media ${media.id} has no URL`);
            return null;
          }

          const resolvedUrl = resolveItemUrl(itemUrl, {
            itemId: item.id,
            mediaId: media.id,
          });
          if (!resolvedUrl) return null;

          console.log(`[Device Playlist] Built MEDIA item URL`, {
            deviceId: canonicalDeviceId,
            playlistId: playlist.id,
            itemId: item.id,
            mediaId: media.id,
            originalUrl: itemUrl,
            resolvedUrl,
            isCloudFront: isCloudFrontUrl(resolvedUrl),
          });

          const durationMs = Math.max(1000, Math.round(Number(durationS) * 1000));

          const assetShim = {
            id: media.id,
            url: resolvedUrl,
            type: itemType,
          };

          return {
            id: item.id,
            type: itemType,
            url: resolvedUrl,
            durationMs,
            order: item.orderIndex ?? 0,
            _playlistItem: item,
            _asset: assetShim,
          };
        })
        .filter(Boolean);
    } else {
      console.warn(`[Device Engine] [${requestId}] Unsupported playlist type for device playback: ${playlist.type}`);
      return res.json({
        ok: true,
        deviceId: canonicalDeviceId,
        state: 'no_binding',
        message: `Playlist type ${playlist.type} is not supported for device playback`,
        playlist: null,
      });
    }
    
    // Fetch MIEntity for each item and build final response
    let items = [];
    try {
      const { getEntityByLink } = await import('../services/miService.js');
      
      // Fetch MIEntity for all items in parallel
      items = await Promise.all(
        itemsWithRefs.map(async (itemRef) => {
          let miEntity = null;
          try {
            miEntity = await getEntityByLink({ screenItemId: itemRef.id });
          } catch (err) {
            // Non-critical error, log but continue
            console.warn(`[Device Engine] [${requestId}] Failed to fetch MIEntity for item ${itemRef.id}:`, err.message);
          }
          
          // Build final item response with MIEntity
          return {
            id: itemRef.id,
            type: itemRef.type,
            url: itemRef.url,
            durationMs: itemRef.durationMs,
            order: itemRef.order,
            // Add asset object with MIEntity (preferred format for frontend)
            asset: {
              id: itemRef._asset.id,
              url: itemRef.url,
              type: itemRef.type,
              miEntity: miEntity || null,
            },
            // Also include miEntity at top level for backward compatibility
            miEntity: miEntity || null,
          };
        })
      );
    } catch (miError) {
      // Non-critical error: MIEntity fetching failed, but playlist should still work
      console.warn(`[Device Engine] [${requestId}] Failed to fetch MIEntity records:`, miError.message);
      // Fallback: return items without MIEntity
      items = itemsWithRefs.map(itemRef => ({
        id: itemRef.id,
        type: itemRef.type,
        url: itemRef.url,
        durationMs: itemRef.durationMs,
        order: itemRef.order,
        asset: {
          id: itemRef._asset.id,
          url: itemRef.url,
          type: itemRef.type,
          miEntity: null,
        },
        miEntity: null,
      }));
    }
    
    // Get orientation from Device model (preferred) or fallback to Screen
    // Use safe default to prevent errors if orientation is null/undefined
    let orientation = device.orientation || 'horizontal'; // Default to horizontal
    let screenId = null;
    
    // Normalize orientation: ensure it's 'horizontal' or 'vertical'
    if (orientation !== 'horizontal' && orientation !== 'vertical') {
      orientation = 'horizontal'; // Default if invalid
    }
    
    // Log orientation for debugging
    console.log('[Device Engine] playlist/full orientation', {
      deviceId: canonicalDeviceId,
      orientation,
      deviceOrientation: device.orientation || 'null (using default)',
    });
    
    // Try to find associated Screen for backward compatibility (if Device orientation not set)
    if (!device.orientation) {
      try {
        if (device.name || device.location) {
          const screenWhere = {
            deletedAt: null,
            OR: [],
          };
          
          if (device.name) {
            screenWhere.OR.push({ name: device.name });
          }
          if (device.location) {
            screenWhere.OR.push({ location: device.location });
          }
          
          if (screenWhere.OR.length > 0) {
            const screen = await prisma.screen.findFirst({
              where: screenWhere,
              select: {
                id: true,
                orientation: true,
              },
              take: 1,
            });
            
            if (screen) {
              screenId = screen.id;
              // Use Screen orientation if Device doesn't have one
              orientation = screen.orientation === 'vertical' ? 'vertical' : 'horizontal';
            }
          }
        }
      } catch (screenError) {
        // Non-fatal: log but continue with default orientation
        console.warn(`[Device Engine] [${requestId}] Failed to find associated screen:`, screenError.message);
      }
    }
    
    // Build normalized response with explicit state (CORE-004)
    // Format matches Android app expectations with version field for format detection
    const bindingVersion = latestBinding?.version || '1';
    const versionNum = typeof bindingVersion === 'string' ? parseInt(bindingVersion, 10) || 1 : (bindingVersion || 1);
    
    // Extract language from query param or Accept-Language header (optional, defaults to original fields)
    const lang = req.query.lang || extractLanguageFromHeader(req.get('Accept-Language'));
    
    // Use translation utilities for playlist name
    const playlistName = playlist 
      ? (getTranslatedField(playlist, 'name', lang) || playlist.name)
      : null;
    
    const response = {
      ok: true,
      deviceId: canonicalDeviceId,
      screenId,
      orientation, // 'horizontal' | 'vertical'
      state,
      message,
      version: bindingVersion, // Include version at top level for easy access
      playlist: playlist && items.length > 0 ? {
        id: playlist.id,
        name: playlistName,
        version: bindingVersion,
        items,
      } : null,
    };
    
    // If playlist exists but has no items, update state and message
    if (playlist && items.length === 0) {
      if (state === 'ready') {
        response.state = 'pending_binding';
        response.message = 'Playlist exists but has no playable items';
      }
      response.playlist = null;
    }
    
    // Backward compatibility aliases (CORE-004)
    if (playlist) {
      response.playlistId = playlist.id;
      response.itemCount = items.length;
      response.hasPlaylist = items.length > 0;
    }
    if (latestBinding) {
      response.bindingStatus = latestBinding.status;
    }

    // First successful fetch with playable items: persist pending → ready so repeat calls are not stuck pending
    if (
      latestBinding &&
      items.length > 0 &&
      String(latestBinding.status || '').trim().toLowerCase() === 'pending'
    ) {
      try {
        await prisma.devicePlaylistBinding.update({
          where: { id: latestBinding.id },
          data: { status: 'ready' },
        });
        response.state = 'ready';
        response.message = 'Playlist ready for playback';
        response.bindingStatus = 'ready';
      } catch (promoteErr) {
        console.warn(
          `[Device Engine] [${requestId}] pending→ready binding update failed (non-fatal):`,
          promoteErr?.message || promoteErr,
        );
      }
    }
    
    // Rich playlist logging (CORE-005) + orientation logging
    const requestIdForLog = requestId || Date.now().toString(36);
    console.log(`[Device Engine] [${requestIdForLog}] Playlist response details:`, {
      deviceId: canonicalDeviceId,
      screenId,
      orientation,
      playlistId: playlist?.id || null,
      state: response.state,
      itemCount: playlist ? (response.playlist?.items?.length || 0) : 0,
      itemTypes: response.playlist?.items?.map(i => i.type) || [],
      hasPlaylist: !!response.playlist,
      bindingStatus: latestBinding?.status || null,
      sampleUrls: response.playlist?.items?.slice(0, 3).map(i => i.url) || [],
    });
    
    // Log orientation specifically as requested
    console.log('[Device Playlist] Sending playlist to device', {
      deviceId: device.id,
      orientation: orientation,
      itemCount: items.length,
    });
    
    console.log('[Device Status] Sending orientation', {
      deviceId: canonicalDeviceId,
      screenId,
      orientation,
    });
    
    // Normalize media URLs in playlist items (fix old IP addresses)
    const { getCoreBaseUrl, normalizePlaylistItems, normalizeMediaUrl } = await import('../utils/mediaUrlNormalizer.js');
    const coreBaseUrl = getCoreBaseUrl(req) || response.coreBaseUrl || null;
    if (coreBaseUrl && response.playlist && Array.isArray(response.playlist.items)) {
      response.playlist.items = normalizePlaylistItems(response.playlist.items, coreBaseUrl);
      if (response.previewUrl) {
        response.previewUrl = normalizeMediaUrl(response.previewUrl, coreBaseUrl);
      }
    }
    
    // Log one sample URL for debugging
    if (response.playlist && response.playlist.items && response.playlist.items.length > 0) {
      console.log("[DeviceEngine V2] Playlist sample URL:", response.playlist.items[0]?.url);
    }

    console.log(`[Device Engine] [${requestId}] playlist/full response`, {
      deviceId: canonicalDeviceId,
      state: response.state,
      message: response.message,
      hasPlaylist: !!response.playlist,
      itemCount: response.playlist?.items?.length ?? 0,
    });
    
    res.json(response);
  } catch (error) {
    console.error(`[Device Engine] [${requestId}] Playlist/full error:`, {
      deviceId: req.params.deviceId,
      error: error.message,
      stack: error.stack,
    });
    
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: 'Failed to fetch playlist',
    });
  }
});

/**
 * POST /api/device/pair-alert
 * Device initiated alert when it cannot reach heartbeat endpoint
 * 
 * Request body:
 *   - deviceId: string (required)
 *   - deviceType?: string
 *   - ip?: string
 *   - reason: "connection_lost" | "pair_request"
 */
router.post('/pair-alert', async (req, res) => {
  try {
    const parsed = PairAlertInput.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_request',
        issues: parsed.error.issues,
      });
    }

    const { deviceId, deviceType, ip, reason } = parsed.data;

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        lastSeenAt: true,
        tenantId: true,
        storeId: true,
        appVersion: true,
      },
    });

    if (!device) {
      return res.status(404).json({
        ok: false,
        error: 'device_not_found',
        message: `Device with id "${deviceId}" not found`,
      });
    }

    const binding = await prisma.devicePlaylistBinding.findFirst({
      where: { deviceId },
      orderBy: { lastPushedAt: 'desc' },
      select: {
        id: true,
        status: true,
        playlistId: true,
        lastPushedAt: true,
      },
    });

    if (binding && binding.status && !['pending', 'ready'].includes(binding.status)) {
      return res.status(409).json({
        ok: false,
        error: 'binding_inactive',
        message: 'Device binding exists but is not active',
        binding: {
          id: binding.id,
          status: binding.status,
          playlistId: binding.playlistId,
          lastPushedAt: binding.lastPushedAt?.toISOString() || null,
        },
      });
    }

    const resolvedDeviceType = deviceType || device.type || 'unknown';
    const alert = await prisma.deviceAlert.create({
      data: {
        deviceId,
        type: reason,
        reason,
        status: 'pending',
        deviceType: resolvedDeviceType,
        ip: ip || req.ip || null,
        message: `Pair alert triggered: ${reason}`,
        engineVersion: device.appVersion || null,
        env: process.env.NODE_ENV || null,
        resolved: false,
      },
    });

    const timestamp = alert.createdAt.toISOString();
    const eventPayload = {
      alertId: alert.id,
      deviceId: alert.deviceId,
      deviceName: device.name || null,
      deviceType: resolvedDeviceType,
      lastSeen: device.lastSeenAt?.toISOString() || null,
      reason,
      status: alert.status,
      tenantId: device.tenantId,
      storeId: device.storeId,
      timestamp,
      bindingId: binding?.id || null,
      bindingStatus: binding?.status || null,
      ip: alert.ip,
    };

    console.log(`[PAIR ALERT] Device ${deviceId} ${reason}. Broadcasting to dashboard...`, {
      alertId: alert.id,
      deviceType: resolvedDeviceType,
      bindingId: binding?.id || null,
    });

    emitPairAlertEvent(eventPayload);

    await addDeviceLog({
      deviceId,
      source: 'system',
      level: 'warn',
      message: `[PAIR ALERT] ${reason}`,
      payload: {
        alertId: alert.id,
        reason,
        status: alert.status,
        ip: alert.ip,
        bindingId: binding?.id || null,
      },
    });

    res.status(202).json({
      ok: true,
      alert: {
        id: alert.id,
        deviceId: alert.deviceId,
        type: alert.type,
        reason: alert.reason,
        status: alert.status,
        createdAt: timestamp,
      },
      binding: binding
        ? {
            id: binding.id,
            status: binding.status,
            playlistId: binding.playlistId,
            lastPushedAt: binding.lastPushedAt?.toISOString() || null,
          }
        : null,
    });
  } catch (error) {
    console.error('[Device Engine] Pair alert error:', error);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: error.message || 'Failed to create pair alert',
    });
  }
});

/**
 * POST /api/device/connection-alert
 * Device-initiated alert when connection/API issues are detected
 * 
 * Request body:
 *   - deviceId: string (required) - Device ID
 *   - type: string (required) - Alert type, e.g., "connection_error"
 *   - message: string (required) - Alert description
 *   - engineVersion?: string - Device engine version (e.g., "DEVICE v2")
 *   - env?: string - Environment (e.g., "DEV", "PROD")
 * 
 * Response:
 *   - ok: boolean
 *   - alert: DeviceAlert object
 * 
 * Emits SSE event: "device:alert" to all connected dashboard clients
 * 
 * @typedef {Object} DeviceAlertPayload
 * @property {string} deviceId - Device ID
 * @property {string} type - Alert type (e.g., "connection_error")
 * @property {string} message - Alert description
 * @property {string} [engineVersion] - Device engine version
 * @property {string} [env] - Environment
 * 
 * @typedef {Object} DeviceAlertEvent
 * @property {string} event - Event name: "device:alert"
 * @property {Object} payload - Alert data
 * @property {string} payload.id - Alert ID
 * @property {string} payload.deviceId - Device ID
 * @property {string} payload.type - Alert type
 * @property {string} payload.message - Alert message
 * @property {string} payload.createdAt - ISO timestamp
 * @property {string} [payload.engineVersion] - Engine version
 * @property {string} [payload.env] - Environment
 */
router.post('/connection-alert', async (req, res) => {
  try {
    const {
      deviceId,
      type,
      message,
      engineVersion,
      env,
    } = req.body || {};

    // Validate required fields
    if (!deviceId || typeof deviceId !== 'string' || deviceId.trim() === '') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_request',
        message: 'deviceId is required and must be a non-empty string',
      });
    }

    if (!type || typeof type !== 'string' || type.trim() === '') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_request',
        message: 'type is required and must be a non-empty string',
      });
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_request',
        message: 'message is required and must be a non-empty string',
      });
    }

    // Validate device exists
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        name: true,
        status: true,
        type: true,
        lastSeenAt: true,
        tenantId: true,
        storeId: true,
        appVersion: true,
      },
    });

    if (!device) {
      return res.status(404).json({
        ok: false,
        error: 'device_not_found',
        message: `Device with id "${deviceId}" not found`,
      });
    }

    // Create alert record
    const alert = await prisma.deviceAlert.create({
      data: {
        deviceId,
        type: type.trim(),
        reason: type.trim(),
        status: 'pending',
        message: message.trim(),
        deviceType: device.type || null,
        ip: req.ip || null,
        engineVersion: engineVersion?.trim() || device.appVersion || null,
        env: env?.trim() || process.env.NODE_ENV || null,
        resolved: false,
      },
    });

    console.log('[Device Engine] Connection alert created', {
      alertId: alert.id,
      deviceId,
      type,
      message: message.substring(0, 100), // Truncate for logging
    });

    // Optionally update device status to "degraded" if it's a connection error
    if (type === 'connection_error' && device.status !== 'degraded') {
      try {
        await prisma.device.update({
          where: { id: deviceId },
          data: { status: 'degraded' },
        });
        console.log('[Device Engine] Updated device status to degraded', { deviceId });
      } catch (updateError) {
        // Log but don't fail the request
        console.warn('[Device Engine] Failed to update device status', {
          deviceId,
          error: updateError.message,
        });
      }
    }

    // Emit SSE/WebSocket event for dashboard
    const eventPayload = {
      id: alert.id,
      deviceId: alert.deviceId,
      type: alert.type,
      status: alert.status,
      reason: alert.reason,
      message: alert.message,
      createdAt: alert.createdAt.toISOString(),
      ...(alert.engineVersion && { engineVersion: alert.engineVersion }),
      ...(alert.env && { env: alert.env }),
    };

    broadcastSse('admin', 'device:alert', eventPayload);
    console.log('[Device Engine] Broadcast device:alert event', {
      alertId: alert.id,
      deviceId,
      type,
    });

    // Also log as device log for audit trail
    try {
      await addDeviceLog({
        deviceId,
        source: 'system',
        level: 'warn',
        message: `Alert raised: ${type} - ${message}`,
        payload: {
          alertId: alert.id,
          type: alert.type,
          reason: alert.reason,
          status: alert.status,
          engineVersion: alert.engineVersion,
          env: alert.env,
        },
      });
    } catch (logError) {
      // Log but don't fail the request
      console.warn('[Device Engine] Failed to create device log', {
        deviceId,
        error: logError.message,
      });
    }

    res.status(201).json({
      ok: true,
      alert: {
        id: alert.id,
        deviceId: alert.deviceId,
        type: alert.type,
        reason: alert.reason,
        status: alert.status,
        message: alert.message,
        engineVersion: alert.engineVersion,
        env: alert.env,
        resolved: alert.status === 'acknowledged' || alert.resolved,
        createdAt: alert.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[Device Engine] Connection alert error:', error);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: error.message || 'Failed to create connection alert',
    });
  }
});

/**
 * POST /api/device/:id/clear-repair
 * Clear repair state for a device (Dashboard-initiated, requires auth)
 * This allows dashboard to manually clear repair state if device is stuck
 * 
 * Response:
 *   - ok: boolean
 *   - deviceId: string
 *   - previousStatus: string
 *   - newStatus: string
 */
router.post('/:id/clear-repair', requireAuth, async (req, res) => {
  try {
    const { id: deviceId } = req.params;

    console.log('[DEVICE_REPAIR] Clear repair request', { deviceId, user: req.user?.id });

    // Get device
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        status: true,
        tenantId: true,
        storeId: true,
      },
    });

    if (!device) {
      return res.status(404).json({
        ok: false,
        error: 'device_not_found',
        message: 'Device not found',
      });
    }

    const previousStatus = device.status;
    const isRepairState = previousStatus === 'repair_requested' || previousStatus === 'repair_in_progress';

    if (!isRepairState) {
      return res.json({
        ok: true,
        deviceId,
        previousStatus,
        newStatus: previousStatus,
        message: 'Device is not in repair state',
      });
    }

    // Clear repair state - set to online
    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: {
        status: 'online',
        lastSeenAt: new Date(),
      },
      select: {
        id: true,
        status: true,
      },
    });

    console.log('[DEVICE_REPAIR] Repair state cleared', {
      deviceId,
      previousStatus,
      newStatus: updated.status,
    });

    // Broadcast status change
    broadcastSse('admin', 'device.status.changed', {
      deviceId: updated.id,
      status: updated.status,
      lastSeenAt: new Date().toISOString(),
      tenantId: device.tenantId,
      storeId: device.storeId,
    });

    res.json({
      ok: true,
      deviceId: updated.id,
      previousStatus,
      newStatus: updated.status,
      message: 'Repair state cleared - device set to online',
    });
  } catch (error) {
    console.error('[DEVICE_REPAIR] Clear repair error:', error);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: error.message || 'Failed to clear repair state',
    });
  }
});

/**
 * GET /api/device/:id/debug
 * Get device debug snapshot (Dashboard-initiated, requires auth, read-only)
 * Returns comprehensive device state for diagnostics
 * 
 * Response:
 *   {
 *     ok: true,
 *     device: { ... },
 *     bindings: [...],
 *     playlist: { ... } | null,
 *     lastHeartbeat: { ... } | null,
 *     repairStatus: string | null,
 *     derivedState: "online_with_playlist" | "online_no_playlist" | "offline" | "repair_waiting"
 *   }
 */
router.get('/:id/debug', requireAuth, async (req, res) => {
  try {
    const { id: deviceId } = req.params;

    console.log('[DEVICE_DEBUG] Debug request', { deviceId, user: req.user?.id });

    // Get device with all relevant data
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        bindings: {
          orderBy: { lastPushedAt: 'desc' },
          take: 5, // Get last 5 bindings
        },
      },
    });

    if (!device) {
      return res.status(404).json({
        ok: false,
        error: 'device_not_found',
        message: 'Device not found',
      });
    }

    // Get active binding
    const activeBinding = device.bindings.find(b => 
      b.status === 'ready' || b.status === 'pending'
    ) || device.bindings[0] || null;

    // Get playlist if binding exists
    let playlist = null;
    if (activeBinding?.playlistId) {
      playlist = await prisma.playlist.findUnique({
        where: { id: activeBinding.playlistId },
        select: {
          id: true,
          name: true,
          type: true,
          items: {
            select: {
              id: true,
              orderIndex: true,
              durationS: true,
            },
            orderBy: { orderIndex: 'asc' },
            take: 10, // Limit items for debug
          },
        },
      });
    }

    // Determine repair status
    const repairStatus = (device.status === 'repair_requested' || device.status === 'repair_in_progress')
      ? device.status
      : null;

    // Derive state
    let derivedState;
    if (repairStatus) {
      derivedState = 'repair_waiting';
    } else if (device.status === 'offline' || !device.lastSeenAt) {
      derivedState = 'offline';
    } else {
      const isOnline = device.lastSeenAt &&
        Date.now() - device.lastSeenAt.getTime() < HEARTBEAT_TIMEOUT_MS;
      
      if (!isOnline) {
        derivedState = 'offline';
      } else if (activeBinding && activeBinding.status === 'ready' && playlist) {
        derivedState = 'online_with_playlist';
      } else {
        derivedState = 'online_no_playlist';
      }
    }

    // Build debug snapshot
    const snapshot = {
      ok: true,
      device: {
        id: device.id,
        name: device.name,
        status: device.status,
        type: device.type,
        platform: device.platform,
        tenantId: device.tenantId,
        storeId: device.storeId,
        pairingCode: device.pairingCode ? '***' : null, // Mask pairing code
        lastSeenAt: device.lastSeenAt?.toISOString() || null,
        createdAt: device.createdAt?.toISOString() || null,
      },
      bindings: device.bindings.map(b => ({
        id: b.id,
        playlistId: b.playlistId,
        status: b.status,
        version: b.version,
        lastPushedAt: b.lastPushedAt?.toISOString() || null,
        createdAt: b.createdAt?.toISOString() || null,
      })),
      playlist: playlist ? (() => {
        // Extract language from query param or Accept-Language header (optional, defaults to original fields)
        const lang = req.query.lang || extractLanguageFromHeader(req.get('Accept-Language'));
        const playlistName = getTranslatedField(playlist, 'name', lang) || playlist.name;
        
        return {
          id: playlist.id,
          name: playlistName,
          type: playlist.type,
          itemCount: playlist.items?.length || 0,
          items: playlist.items?.slice(0, 5) || [], // Limit items
        };
      })() : null,
      lastHeartbeat: device.lastSeenAt ? {
        timestamp: device.lastSeenAt.toISOString(),
        ageSeconds: Math.round((Date.now() - device.lastSeenAt.getTime()) / 1000),
      } : null,
      repairStatus,
      derivedState,
      activeBindingId: activeBinding?.id || null,
      activeBindingStatus: activeBinding?.status || null,
    };

    console.log('[DEVICE_DEBUG] Debug snapshot generated', {
      deviceId,
      derivedState,
      repairStatus,
      hasPlaylist: !!playlist,
      bindingCount: device.bindings.length,
    });

    res.json(snapshot);
  } catch (error) {
    console.error('[DEVICE_DEBUG] Debug error:', error);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: error.message || 'Failed to generate debug snapshot',
    });
  }
});

/**
 * POST /api/device/update
 * Update device information (name, location, model, orientation)
 * Auth required
 * 
 * Request body:
 * {
 *   deviceId: string (required),
 *   name?: string,
 *   location?: string,
 *   model?: string,
 *   orientation?: "horizontal" | "vertical"
 * }
 * 
 * Response:
 * {
 *   ok: true,
 *   device: DeviceDto
 * }
 */
router.post('/update', requireAuth, async (req, res) => {
  const requestId = Math.random().toString(36).slice(2, 9);
  
  try {
    const { deviceId, name, location, model, orientation } = req.body || {};
    
    // Validate deviceId
    if (!deviceId || typeof deviceId !== 'string' || deviceId.trim() === '') {
      return res.status(400).json({
        ok: false,
        error: 'deviceId_required',
        message: 'deviceId is required',
      });
    }
    
    console.log(`[Device Engine] [${requestId}] POST /api/device/update`, {
      deviceId,
      hasName: name !== undefined,
      hasLocation: location !== undefined,
      hasModel: model !== undefined,
      hasOrientation: orientation !== undefined,
    });
    
    // Find device
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        name: true,
        location: true,
        model: true,
        orientation: true,
        tenantId: true,
        storeId: true,
        status: true,
        platform: true,
        type: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    
    if (!device) {
      console.log(`[Device Engine] [${requestId}] Device not found: ${deviceId}`);
      return res.status(404).json({
        ok: false,
        error: 'device_not_found',
        message: 'Device not found',
      });
    }
    
    // Build update data for Device
    const deviceUpdateData = {};
    if (name !== undefined) {
      deviceUpdateData.name = name === null || name === '' ? null : String(name).trim();
    }
    if (location !== undefined) {
      deviceUpdateData.location = location === null || location === '' ? null : String(location).trim();
    }
    if (model !== undefined) {
      deviceUpdateData.model = model === null || model === '' ? null : String(model).trim();
    }
    if (orientation !== undefined) {
      // Validate orientation value
      if (orientation !== 'horizontal' && orientation !== 'vertical') {
        return res.status(400).json({
          ok: false,
          error: 'invalid_orientation',
          message: 'Orientation must be "horizontal" or "vertical"',
        });
      }
      deviceUpdateData.orientation = orientation;
      
      // Log orientation update
      console.log('[Device] Updating orientation', {
        deviceId: deviceId,
        orientation: orientation,
      });
    }
    
    // Update device if there are fields to update
    let updatedDevice = device;
    if (Object.keys(deviceUpdateData).length > 0) {
      updatedDevice = await prisma.device.update({
        where: { id: deviceId },
        data: deviceUpdateData,
        select: {
          id: true,
          name: true,
          location: true,
          model: true,
          orientation: true,
          tenantId: true,
          storeId: true,
          status: true,
          platform: true,
          type: true,
          lastSeenAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      
      console.log(`[Device Engine] [${requestId}] Device updated`, {
        deviceId,
        updatedFields: Object.keys(deviceUpdateData),
      });
    }
    
    // Orientation is now stored directly on Device model, so no need to update Screen
    // (Screen orientation is kept for backward compatibility with legacy screens)
    
    // Emit device update event
    try {
      broadcastSse('admin', 'device.updated', {
        deviceId: updatedDevice.id,
        name: updatedDevice.name,
        location: updatedDevice.location,
        model: updatedDevice.model,
        screenId,
        orientation: screenOrientation,
      });
    } catch (eventError) {
      // Non-fatal: log but continue
      console.warn(`[Device Engine] [${requestId}] Failed to emit device.updated event:`, eventError.message);
    }
    
    // Build response
    const response = {
      ok: true,
      device: {
        id: updatedDevice.id,
        name: updatedDevice.name,
        location: updatedDevice.location,
        model: updatedDevice.model,
        orientation: updatedDevice.orientation || 'horizontal', // Device orientation (defaults to horizontal)
        tenantId: updatedDevice.tenantId,
        storeId: updatedDevice.storeId,
        status: updatedDevice.status,
        platform: updatedDevice.platform,
        type: updatedDevice.type,
        lastSeenAt: updatedDevice.lastSeenAt?.toISOString() || null,
        createdAt: updatedDevice.createdAt?.toISOString() || null,
        updatedAt: updatedDevice.updatedAt?.toISOString() || null,
      },
    };
    
    console.log(`[Device Engine] [${requestId}] Update response`, {
      deviceId: response.device.id,
      orientation: response.device.orientation,
    });
    
    res.json(response);
  } catch (error) {
    console.error(`[Device Engine] [${requestId}] Update error:`, {
      deviceId: req.body?.deviceId,
      error: error.message,
      stack: error.stack,
    });
    
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: error.message || 'Failed to update device',
    });
  }
});

/**
 * Helper to extract tenantId/storeId from authenticated request
 * Uses the same pattern as other routes for consistency
 */
function getTenantStoreFromRequest(req) {
  // Try to extract from query params first (highest priority)
  let tenantId = req.query.tenantId;
  let storeId = req.query.storeId;
  
  // Fall back to body params
  if (!tenantId) tenantId = req.body?.tenantId;
  if (!storeId) storeId = req.body?.storeId;
  
  // Fall back to auth context
  if (!tenantId && req.userId) {
    tenantId = req.userId; // Use userId as tenantId
  }
  if (!storeId && req.user?.business?.id) {
    storeId = req.user.business.id; // Use business.id as storeId
  }
  
  // Legacy fallback
  if (!tenantId) tenantId = req.user?.business?.tenantId || req.workspace?.tenantId;
  if (!storeId) storeId = req.user?.business?.storeId || req.workspace?.storeId;
  
  // For dev mode, allow default tenant/store when none is passed
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    tenantId = tenantId || process.env.DEV_TENANT_ID || req.userId || 'temp';
    storeId = storeId || process.env.DEV_STORE_ID || req.user?.business?.id || 'temp';
  }
  
  // Convert to strings and trim
  tenantId = tenantId ? String(tenantId).trim() : null;
  storeId = storeId ? String(storeId).trim() : null;
  
  return { tenantId, storeId };
}

/**
 * Generate a unique pairing code (6 characters, uppercase alphanumeric)
 */
function generatePairingCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars like 0, O, I, 1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * POST /api/device/pair/init
 * Dashboard-initiated pairing: Create a pairing code for the current tenant/store
 * 
 * Auth: Required (dashboard user)
 * 
 * Request body:
 *   - storeId?: string (optional, can come from auth context)
 *   - deviceLabel?: string (optional label for the device)
 * 
 * Response:
 *   {
 *     ok: true,
 *     pairingCode: string (6-character code),
 *     expiresAt: string (ISO 8601),
 *     tenantId: string,
 *     storeId: string
 *   }
 */
router.post('/pair/init', requireAuth, async (req, res) => {
  const requestId = Math.random().toString(36).slice(2, 9);
  
  try {
    console.log(`[Device Engine] [${requestId}] POST /api/device/pair/init`, {
      body: req.body,
      user: req.user?.id,
    });

    const { storeId: bodyStoreId, deviceLabel } = req.body;
    
    // Get tenantId and storeId from request context
    const { tenantId, storeId } = getTenantStoreFromRequest(req);
    
    // Override storeId if explicitly provided in body
    const finalStoreId = bodyStoreId || storeId;
    
    if (!tenantId || !finalStoreId) {
      console.warn(`[Device Engine] [${requestId}] Missing tenantId or storeId`, {
        hasTenantId: !!tenantId,
        hasStoreId: !!finalStoreId,
      });
      
      return res.status(400).json({
        ok: false,
        error: 'missing_fields',
        message: 'tenantId and storeId are required (can come from auth context or request body)',
      });
    }

    // Generate unique pairing code
    let pairingCode;
    let attempts = 0;
    do {
      pairingCode = generatePairingCode();
      const existing = await prisma.devicePairing.findUnique({
        where: { pairingCode },
      });
      if (!existing) break;
      attempts++;
      if (attempts > 10) {
        console.error(`[Device Engine] [${requestId}] Failed to generate unique pairing code after ${attempts} attempts`);
        return res.status(500).json({
          ok: false,
          error: 'pairing_code_generation_failed',
          message: 'Failed to generate unique pairing code',
        });
      }
    } while (true);

    // Pairing code expires in 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Create DevicePairing record
    const pairing = await prisma.devicePairing.create({
      data: {
        tenantId,
        storeId: finalStoreId,
        pairingCode,
        expiresAt,
        status: 'pending',
        deviceLabel: deviceLabel || null,
      },
    });

    console.log(`[Device Engine] Pair init: tenantId=${tenantId}, storeId=${finalStoreId}, pairingCode=${pairingCode}`);

    res.json({
      ok: true,
      pairingCode,
      expiresAt: expiresAt.toISOString(),
      tenantId,
      storeId: finalStoreId,
    });
  } catch (error) {
    console.error(`[Device Engine] [${requestId}] Pair init error:`, {
      error: error.message,
      stack: error.stack,
    });
    
    res.status(500).json({
      ok: false,
      error: 'pairing_init_failed',
      message: error.message || 'Failed to create pairing code',
    });
  }
});

/**
 * POST /api/device/pair/complete
 * Device-initiated pairing completion: Complete pairing using a pairing code
 * 
 * Auth: Not required (called by device)
 * 
 * Request body:
 *   - pairingCode: string (required)
 *   - platform?: string (e.g., "android", "firetv")
 *   - model?: string
 *   - appVersion?: string
 *   - deviceLabel?: string
 * 
 * Response:
 *   {
 *     ok: true,
 *     deviceId: string,
 *     tenantId: string,
 *     storeId: string,
 *     engine: "DEVICE_V2",
 *     heartbeatIntervalSec: 30
 *   }
 */
router.post('/pair/complete', async (req, res) => {
  const requestId = Math.random().toString(36).slice(2, 9);
  
  try {
    console.log(`[Device Engine] [${requestId}] POST /api/device/pair/complete (NEW FLOW - dashboard-initiated)`);
    console.log(`[Device Engine] [${requestId}] Request from IP: ${req.ip}`);
    console.log(`[Device Engine] [${requestId}] Request body:`, {
      hasPairingCode: !!req.body?.pairingCode,
      pairingCode: req.body?.pairingCode ? `${String(req.body.pairingCode).substring(0, 2)}****` : 'missing',
      platform: req.body?.platform || 'not provided',
      model: req.body?.model || 'not provided',
      appVersion: req.body?.appVersion || 'not provided',
      deviceLabel: req.body?.deviceLabel || 'not provided',
    });

    const { pairingCode, platform, model, appVersion, deviceLabel } = req.body;

    if (!pairingCode) {
      return res.status(400).json({
        ok: false,
        error: 'missing_fields',
        message: 'pairingCode is required',
      });
    }

    // Normalize pairing code (uppercase, trim)
    const normalizedCode = String(pairingCode).trim().toUpperCase();

    // Lookup DevicePairing
    const pairing = await prisma.devicePairing.findUnique({
      where: { pairingCode: normalizedCode },
    });

    if (!pairing) {
      console.warn(`[Device Engine] [${requestId}] Pairing code not found: ${normalizedCode}`);
      
      // Check if there are any pending pairings to help debug
      const pendingPairings = await prisma.devicePairing.findMany({
        where: { status: 'pending' },
        select: { pairingCode: true, expiresAt: true, createdAt: true },
        take: 5,
        orderBy: { createdAt: 'desc' },
      });
      
      console.log(`[Device Engine] [${requestId}] Available pending pairings:`, pendingPairings.map(p => ({
        code: p.pairingCode,
        expiresAt: p.expiresAt.toISOString(),
        createdAt: p.createdAt.toISOString(),
      })));
      
      return res.status(400).json({
        ok: false,
        error: 'invalid_or_expired_code',
        message: `Invalid or expired pairing code: ${normalizedCode}. Make sure you created a pairing code from the dashboard first.`,
      });
    }

    // Check if pairing is still pending
    if (pairing.status !== 'pending') {
      console.warn(`[Device Engine] [${requestId}] Pairing already ${pairing.status}: ${normalizedCode}`);
      return res.status(400).json({
        ok: false,
        error: 'pairing_already_completed',
        message: 'This pairing code has already been used',
      });
    }

    // Check if pairing has expired
    const now = new Date();
    if (now > pairing.expiresAt) {
      // Mark as expired
      await prisma.devicePairing.update({
        where: { id: pairing.id },
        data: { status: 'expired' },
      });
      
      console.warn(`[Device Engine] [${requestId}] Pairing code expired: ${normalizedCode}`);
      return res.status(400).json({
        ok: false,
        error: 'invalid_or_expired_code',
        message: 'Pairing code has expired',
      });
    }

    // Find or create Device
    let device;
    if (pairing.deviceId) {
      // Update existing device
      device = await prisma.device.update({
        where: { id: pairing.deviceId },
        data: {
          tenantId: pairing.tenantId,
          storeId: pairing.storeId,
          name: deviceLabel || pairing.deviceLabel || 'Screen device',
          platform: platform || null,
          model: model || null,
          appVersion: appVersion || null,
          status: 'online',
          lastSeenAt: now,
          orientation: 'horizontal', // Default orientation
        },
      });
    } else {
      // Create new device
      device = await prisma.device.create({
        data: {
          tenantId: pairing.tenantId,
          storeId: pairing.storeId,
          name: deviceLabel || pairing.deviceLabel || 'Screen device',
          platform: platform || null,
          model: model || null,
          appVersion: appVersion || null,
          status: 'online',
          lastSeenAt: now,
          orientation: 'horizontal', // Default orientation
          type: 'screen', // Default type
        },
      });
    }

    // Update DevicePairing to mark as completed
    await prisma.devicePairing.update({
      where: { id: pairing.id },
      data: {
        status: 'completed',
        deviceId: device.id,
      },
    });

    console.log(`[Device Engine] Pair complete: pairingCode=${normalizedCode}, deviceId=${device.id}, tenantId=${pairing.tenantId}, storeId=${pairing.storeId}`);
    console.log(`[Device Engine] [${requestId}] Device created/updated successfully:`, {
      deviceId: device.id,
      name: device.name,
      platform: device.platform,
      model: device.model,
      status: device.status,
      tenantId: device.tenantId,
      storeId: device.storeId,
    });

    // Emit device pairing completed event for real-time dashboard updates
    try {
      const { emitDeviceEvent, DEVICE_ENGINE_EVENT_TYPES } = await import('../engines/device/deviceEvents.js');
      emitDeviceEvent({
        type: DEVICE_ENGINE_EVENT_TYPES.PAIRING_CLAIMED,
        payload: {
          deviceId: device.id,
          tenantId: pairing.tenantId,
          storeId: pairing.storeId,
          pairingCode: normalizedCode,
          name: device.name,
          status: device.status,
          engine: 'DEVICE_V2',
        },
      });
      console.log(`[Device Engine] [${requestId}] Emitted pairing.claimed event`);
    } catch (eventError) {
      console.warn(`[Device Engine] [${requestId}] Failed to emit event (non-fatal):`, eventError.message);
    }

    // Also emit legacy SSE event for backward compatibility
    try {
      const { broadcastSse } = await import('../realtime/simpleSse.js');
      broadcastSse('admin', 'device:paired', {
        deviceId: device.id,
        name: device.name,
        platform: device.platform || null,
        type: device.type || 'screen',
        status: device.status,
        lastSeenAt: device.lastSeenAt?.toISOString() || null,
        tenantId: pairing.tenantId,
        storeId: pairing.storeId,
      });
      console.log(`[Device Engine] [${requestId}] Broadcasted SSE device:paired event`);
    } catch (sseError) {
      console.warn(`[Device Engine] [${requestId}] Failed to broadcast SSE (non-fatal):`, sseError.message);
    }

    res.json({
      ok: true,
      deviceId: device.id,
      tenantId: pairing.tenantId,
      storeId: pairing.storeId,
      engine: 'DEVICE_V2',
      heartbeatIntervalSec: 30,
    });
  } catch (error) {
    console.error(`[Device Engine] [${requestId}] Pair complete error:`, {
      error: error.message,
      stack: error.stack,
    });
    
    res.status(500).json({
      ok: false,
      error: 'pairing_complete_failed',
      message: error.message || 'Failed to complete pairing',
    });
  }
});

/**
 * DEBUG ENDPOINTS - Device Engine Diagnostics
 * ⚠️ FOR LOCAL/DEV ONLY - NOT FOR PRODUCTION
 */

/**
 * GET /api/device/debug/ping
 * Simple connectivity test endpoint for tablets
 * Returns request metadata to verify network path
 */
router.get('/debug/ping', (req, res) => {
  console.log('[DEVICE DEBUG] Ping request received', {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString(),
  });

  res.json({
    ok: true,
    message: 'Device Debug Ping OK',
    timestamp: new Date().toISOString(),
    ip: req.ip,
    headers: {
      'user-agent': req.headers['user-agent'],
      'accept': req.headers['accept'],
      'content-type': req.headers['content-type'],
    },
  });
});

/**
 * GET /api/device/debug/run-all
 * Comprehensive connectivity test endpoint
 * Tests all critical backend services
 */
router.get('/debug/run-all', async (req, res) => {
  console.log('[DEVICE DEBUG] Run-all diagnostics requested', {
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  const results = {
    timestamp: new Date().toISOString(),
    apiHealth: { ok: false, error: null },
    dbConnection: { ok: false, error: null },
    deviceCount: { count: 0, error: null },
    websocketStatus: { ok: false, error: null },
    reachableFromDashboard: true,
  };

  // Test API health
  try {
    const healthResponse = await fetch(`http://localhost:${process.env.PORT || 3001}/api/health`);
    results.apiHealth = {
      ok: healthResponse.ok,
      status: healthResponse.status,
      error: healthResponse.ok ? null : `HTTP ${healthResponse.status}`,
    };
  } catch (err) {
    results.apiHealth.error = err.message;
  }

  // Test database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    results.dbConnection = { ok: true };
  } catch (err) {
    results.dbConnection.error = err.message;
  }

  // Count devices
  try {
    const count = await prisma.device.count();
    results.deviceCount = { count, ok: true };
  } catch (err) {
    results.deviceCount.error = err.message;
  }

  // WebSocket status (check if SSE is healthy)
  try {
    const { isSseHealthy } = await import('../realtime/sse.js');
    const sseOk = isSseHealthy(60000);
    results.websocketStatus = { ok: sseOk };
  } catch (err) {
    results.websocketStatus.error = err.message;
  }

  res.json({
    ok: true,
    results,
  });
});

export default router;
