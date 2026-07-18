/**
 * Device Engine API Routes
 * Exposes device engine tools as HTTP endpoints
 * 
 * Device Engine Map (generated):
 * - Pairing:
 *   * POST /api/device/request-pairing - Device requests pairing code (no auth)
 *   * POST /api/device/complete-pairing - Dashboard completes pairing (no auth)
 *   * POST /api/device/claim - Dashboard claims pairing session (auth required)
 *   * GET /api/device/unpaired - Pending temp/pairingCode devices (auth required)
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

import crypto from 'crypto';
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
import {
  isActivePlaylistBindingStatus,
  applyAndroidPlaylistFullCompat,
  pickPlaylistBindingForPlayback,
} from '../utils/playlistFullAndroidCompat.js';
import {
  resolveCoreUrlFromHeartbeat,
  resolvePlaylistMediaBaseUrl,
  resolvePlaylistItemMediaUrl,
  derivePairingStatus,
  pickActivePlaylistBinding,
  readDeviceMetadata,
  upsertDeviceMetadata,
  buildProjectedDeviceFields,
} from '../lib/deviceProjection.js';
import {
  resolveCanonicalDevice,
  persistInstallationId,
  logDeviceIdentityEvent,
  isDeviceArchived,
  hashInstallationId,
  buildDuplicateReportEntry,
  normalizeInstallationId,
} from '../lib/deviceIdentity.js';
import { preferTvSafeVideoPublicPath } from '../lib/videoIosSafe.js';
// Also import from new mediaUrlNormalizer for additional normalization
import { getTranslatedField } from '../services/i18n/translationUtils.js';
import {
  completePairing,
  heartbeat,
  confirmPlaylistReady,
  triggerRepair,
} from '../engines/device/index.js';
import { executeDeviceRequestPairing } from '../engines/device/deviceRequestPairingBridge.js';
import {
  enqueueDeviceCommand,
  getPendingCommandsForDevice,
  markCommandsAsExecuted,
  markCommandsAsSent,
} from '../engines/device/commands.js';
import { addDeviceLog, getRecentLogs } from '../engines/device/logs.js';
import { hasActiveMissionPipelineExecution } from '../lib/missionExecutionGuard.js';
import {
  isSqliteBestEffortLaneEnabled,
  runBestEffortSqliteWrite,
  runBestEffortSqliteWriteAwait,
} from '../lib/sqliteBestEffortWrite.js';
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
          take: 8,
        },
        snapshots: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        capabilities: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Observability: device identity contract diagnostics for list visibility.
    const [mismatchCountSameTenant, tempCount, otherStoreSamples] = await Promise.all([
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
      prisma.device.findMany({
        where: {
          tenantId: String(tenantId),
          storeId: { not: String(storeId) },
        },
        select: {
          id: true,
          name: true,
          storeId: true,
          platform: true,
          lastSeenAt: true,
        },
        orderBy: { lastSeenAt: 'desc' },
        take: 5,
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
      .map((d) => pickActivePlaylistBinding(d.bindings || [])?.playlistId)
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
    const formattedDevices = devices
      .filter((device) => {
        const cap = Array.isArray(device.capabilities)
          ? device.capabilities[0]
          : device.capabilities;
        const meta = readDeviceMetadata(cap);
        return !meta.archivedAt;
      })
      .map((device) => {
      const latestBinding = pickActivePlaylistBinding(device.bindings || []);
      const latestSnapshot = device.snapshots[0] || null;
      const metadata = readDeviceMetadata(
        Array.isArray(device.capabilities) ? device.capabilities[0] : device.capabilities,
      );

      const presence = computeDevicePresenceWithPlayback(device, now);
      const heartbeatOnline = presence.isOnline;

      if (IS_DEV) {
        console.log('[DEVICE_PRESENCE_COMPUTE]', {
          deviceId: device.id,
          lastSeenAt: device.lastSeenAt?.toISOString?.() ?? null,
          presenceTier: presence.presenceTier,
          heartbeatOnline,
          playbackReported: presence.playbackReported,
        });
      }

      const playlistId = latestBinding?.playlistId || metadata.currentPlaylistId || null;
      const playlistName = playlistId ? playlistMap.get(playlistId) || null : null;

      const projected = buildProjectedDeviceFields({
        device,
        latestBinding,
        latestSnapshot,
        playlistName,
        presence,
        metadata,
      });

      return {
        id: device.id,
        tenantId: device.tenantId,
        storeId: device.storeId,
        name: device.name,
        model: device.model,
        location: device.location,
        status: heartbeatOnline ? 'online' : 'offline',
        isOnline: heartbeatOnline,
        presenceTier: projected.presenceTier,
        playbackReported: projected.playbackReported,
        lastPlaybackReportAt: projected.lastPlaybackReportAt,
        playbackReportIsPlaying: projected.playbackReportIsPlaying,
        playbackReportState: projected.playbackReportState,
        staleState: projected.staleState,
        archiveEligible: projected.archiveEligible,
        archivedAt: null,
        type: device.type || 'other',
        platform: device.platform || null,
        appVersion: device.appVersion,
        engineVersion: projected.engineVersion,
        coreUrl: projected.coreUrl,
        pairingStatus: projected.pairingStatus,
        currentPlaylistId: projected.currentPlaylistId,
        playbackReady: projected.playbackReady,
        lastSeenAt: device.lastSeenAt,
        createdAt: device.createdAt,
        updatedAt: device.updatedAt,
        playlistId: projected.playlistId,
        playlistName: projected.playlistName,
        playlist: projected.playlist,
        lastSnapshot: projected.lastSnapshot,
        lastScreenshotBase64: device.lastScreenshotBase64 || null,
        lastScreenshotAt: device.lastScreenshotAt || null,
      };
    });

    const { markDuplicateDevicesInList } = await import('../lib/deviceListDuplicateMarking.js');
    markDuplicateDevicesInList(formattedDevices, now);

    console.log('[DEVICE_PROJECTION_REFRESH]', {
      tenantId: String(tenantId),
      storeId: String(storeId),
      deviceCount: formattedDevices.length,
      withCoreUrl: formattedDevices.filter((d) => d.coreUrl).length,
      withActiveBinding: formattedDevices.filter((d) => d.playlist?.playlistId).length,
      sample: formattedDevices.slice(0, 3).map((d) => ({
        id: d.id,
        coreUrl: d.coreUrl,
        pairingStatus: d.pairingStatus,
        playlistId: d.playlistId,
        bindingStatus: d.playlist?.status,
      })),
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
        visibility: {
          matchedCount: formattedDevices.length,
          sameTenantOtherStoreCount: mismatchCountSameTenant,
          tempPendingCount: tempCount,
          otherStores: otherStoreSamples.map((d) => ({
            deviceId: d.id,
            name: d.name,
            storeId: d.storeId,
            platform: d.platform,
            lastSeenAt: d.lastSeenAt?.toISOString?.() || d.lastSeenAt || null,
          })),
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
 * GET /api/device/unpaired
 * Pending device-initiated pairing sessions (temp tenant/store and/or active pairingCode).
 * These never appear in GET /list until complete-pairing commits real identity.
 */
router.get('/unpaired', requireAuth, async (req, res) => {
  try {
    console.log('[HTTP] GET /api/device/unpaired');

    const now = new Date();
    const {
      pairingExpiresAt,
      loadPairingCodeIssuedAt,
    } = await import('../engines/device/pairingSessionTiming.js');

    const devices = await prisma.device.findMany({
      where: {
        OR: [
          { tenantId: 'temp', storeId: 'temp' },
          { pairingCode: { not: null } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        tenantId: true,
        storeId: true,
        name: true,
        model: true,
        location: true,
        status: true,
        type: true,
        platform: true,
        appVersion: true,
        pairingCode: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const formattedDevices = await Promise.all(
      devices.map(async (device) => {
        let expiresAtIso = null;
        if (device.pairingCode) {
          try {
            const issuedAt = await loadPairingCodeIssuedAt(prisma, device.id);
            expiresAtIso = pairingExpiresAt(device, issuedAt).toISOString();
          } catch {
            expiresAtIso = null;
          }
        }

        const isOnline =
          device.lastSeenAt &&
          now.getTime() - new Date(device.lastSeenAt).getTime() < HEARTBEAT_TIMEOUT_MS;

        return {
          id: device.id,
          tenantId: device.tenantId,
          storeId: device.storeId,
          name: device.name,
          model: device.model,
          location: device.location,
          status: isOnline ? 'online' : 'offline',
          isOnline: !!isOnline,
          presenceTier: isOnline ? 'online' : 'offline',
          type: device.type || 'screen',
          platform: device.platform || null,
          appVersion: device.appVersion,
          pairingStatus: device.pairingCode ? 'waiting_for_pairing' : 'unpaired',
          pairingCode: device.pairingCode || null,
          pairingExpiresAt: expiresAtIso,
          lastSeenAt: device.lastSeenAt,
          createdAt: device.createdAt,
          updatedAt: device.updatedAt,
          playlist: null,
          lastSnapshot: null,
        };
      })
    );

    console.log('[Device Engine] Unpaired devices:', {
      count: formattedDevices.length,
      withCode: formattedDevices.filter((d) => d.pairingCode).length,
    });

    res.json({
      ok: true,
      data: { devices: formattedDevices },
    });
  } catch (error) {
    console.error('[Device Engine] Unpaired list error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to list unpaired devices',
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

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { capabilities: true, bindings: { take: 1, orderBy: { lastPushedAt: 'desc' } } },
    });

    if (!device) {
      return res.status(404).json({ ok: false, error: 'Device not found' });
    }

    if (device.tenantId !== String(tenantId) || device.storeId !== String(storeId)) {
      return res.status(403).json({ ok: false, error: 'Access denied' });
    }

    const cap = device.capabilities?.[0];
    const prev =
      cap?.capabilities && typeof cap.capabilities === 'object'
        ? cap.capabilities
        : {};
    const archivedAt = new Date().toISOString();
    await prisma.deviceCapability.upsert({
      where: { deviceId },
      update: {
        capabilities: { ...prev, archivedAt, archiveReason: 'manual_archive' },
      },
      create: {
        deviceId,
        capabilities: { archivedAt, archiveReason: 'manual_archive' },
      },
    });
    await prisma.device.update({
      where: { id: deviceId },
      data: { status: 'offline' },
    });

    console.log('[DEVICE_STALE_ARCHIVE]', {
      deviceId,
      tenantId: String(tenantId),
      storeId: String(storeId),
      archivedAt,
      reason: 'manual_archive',
    });

    return res.json({
      ok: true,
      deviceId,
      archivedAt,
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
 * POST /api/device/:deviceId/unpair
 * Soft-unpair device from store: clear bindings, reset tenant/store (optional), queue returnHome.
 * Body/query: tenantId, storeId (required unless admin); optional reason, archive, clearBindings, resetToTemp.
 */
router.post('/:deviceId/unpair', requireAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const tenantId = String(
      req.body?.tenantId || req.query?.tenantId || req.userId || req.user?.tenantId || '',
    ).trim();
    const storeId = String(req.body?.storeId || req.query?.storeId || '').trim();
    const reason = String(req.body?.reason || 'manual_unpair').trim();
    const archive = Boolean(req.body?.archive);
    const clearBindings = req.body?.clearBindings !== false;
    const resetToTemp = req.body?.resetToTemp !== false;

    if (!deviceId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required field',
        message: 'deviceId is required',
      });
    }

    const { unpairDevice: runUnpairDevice } = await import('../services/deviceUnpairService.js');
    const result = await runUnpairDevice(prisma, {
      deviceId,
      tenantId,
      storeId,
      userId: req.userId,
      user: req.user,
      reason,
      archive,
      clearBindings,
      resetToTemp,
    });

    return res.json(result);
  } catch (error) {
    const status = error.status || 500;
    console.error('[DEVICE_UNPAIR_FAILED]', error);
    return res.status(status).json({
      ok: false,
      error: error.message || 'Failed to unpair device',
    });
  }
});

/**
 * POST /api/device/:deviceId/reassign-store
 * Same-account store reassignment — updates existing device row; does not require re-pairing.
 * Body: { tenantId, storeId? (current), newStoreId, playlistId? }
 */
router.post('/:deviceId/reassign-store', requireAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const tenantId = String(
      req.body?.tenantId || req.query?.tenantId || req.userId || req.user?.tenantId || '',
    ).trim();
    const storeId = String(req.body?.storeId || req.query?.storeId || '').trim();
    const newStoreId = String(req.body?.newStoreId || req.body?.targetStoreId || '').trim();
    const playlistId = req.body?.playlistId
      ? String(req.body.playlistId).trim()
      : null;

    if (!deviceId || !newStoreId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required field',
        message: 'deviceId and newStoreId are required',
      });
    }

    const { reassignDeviceStore } = await import('../services/deviceReassignService.js');
    const result = await reassignDeviceStore(prisma, {
      deviceId,
      tenantId,
      storeId,
      newStoreId,
      playlistId,
      userId: req.userId,
      user: req.user,
    });

    return res.json(result);
  } catch (error) {
    const status = error.status || 500;
    console.error('[DEVICE_REASSIGN_FAILED]', error);
    return res.status(status).json({
      ok: false,
      error: error.message || 'Failed to reassign device store',
    });
  }
});

/**
 * GET /api/device/duplicates
 * Admin/debug report of likely physical duplicates (installationId + weak signals).
 * Query: tenantId (required), storeId? (optional filter)
 */
router.get('/duplicates', requireAuth, async (req, res) => {
  try {
    const tenantId = String(req.query?.tenantId || req.userId || '').trim();
    const storeId = String(req.query?.storeId || '').trim();
    if (!tenantId) {
      return res.status(400).json({ ok: false, error: 'tenantId is required' });
    }

    const where = {
      tenantId,
      ...(storeId ? { storeId } : {}),
    };
    const devices = await prisma.device.findMany({
      where,
      include: {
        capabilities: { take: 1 },
        bindings: {
          where: { status: { in: ['ready', 'pending', 'active', 'assigned'] } },
          take: 1,
          orderBy: { lastPushedAt: 'desc' },
        },
      },
      orderBy: { lastSeenAt: 'desc' },
      take: 500,
    });

    const byInstall = new Map();
    const byFingerprint = new Map();

    for (const d of devices) {
      const caps =
        d.capabilities?.[0]?.capabilities && typeof d.capabilities[0].capabilities === 'object'
          ? d.capabilities[0].capabilities
          : {};
      if (caps.archivedAt) continue;

      const installKey = String(d.installationId || caps.installationId || '').trim();
      if (installKey) {
        if (!byInstall.has(installKey)) byInstall.set(installKey, []);
        byInstall.get(installKey).push(d);
      }

      const fp = [
        d.tenantId,
        d.type || 'screen',
        d.platform || '',
        d.model || '',
      ].join('|').toLowerCase();
      if (!byFingerprint.has(fp)) byFingerprint.set(fp, []);
      byFingerprint.get(fp).push(d);
    }

    const reports = [];

    for (const [installKey, members] of byInstall.entries()) {
      if (members.length < 2) continue;
      const sorted = [...members].sort((a, b) => {
        const aT = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
        const bT = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
        return bT - aT;
      });
      const canonical = sorted[0];
      const dups = sorted.slice(1);
      const sameOwner = dups.every((d) => d.tenantId === canonical.tenantId);
      reports.push(
        buildDuplicateReportEntry({
          canonicalDeviceId: canonical.id,
          duplicateDeviceIds: dups.map((d) => d.id),
          ownership: {
            accountId: canonical.tenantId,
            pairingStatus: readDeviceMetadata(canonical.capabilities?.[0])?.pairingStatus || null,
          },
          storeAssignment: canonical.storeId,
          lastSeenAt: canonical.lastSeenAt?.toISOString?.() || null,
          playlistAssignment: canonical.bindings?.[0]?.playlistId || null,
          reason: 'shared_installationId',
          installationIdHash: hashInstallationId(installKey),
          safeMergeEligible: sameOwner,
        }),
      );
      logDeviceIdentityEvent('DUPLICATE_DEVICE_DETECTED', {
        deviceId: canonical.id,
        canonicalDeviceId: canonical.id,
        accountId: canonical.tenantId,
        storeId: canonical.storeId,
        reason: `installationId_group size=${members.length}`,
      });
    }

    // Weak fingerprint groups only when installationId missing on all members.
    for (const [, members] of byFingerprint.entries()) {
      if (members.length < 2) continue;
      const allMissingInstall = members.every((d) => {
        const caps =
          d.capabilities?.[0]?.capabilities && typeof d.capabilities[0].capabilities === 'object'
            ? d.capabilities[0].capabilities
            : {};
        return !d.installationId && !caps.installationId;
      });
      if (!allMissingInstall) continue;
      const sorted = [...members].sort((a, b) => {
        const aT = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
        const bT = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
        return bT - aT;
      });
      const canonical = sorted[0];
      reports.push(
        buildDuplicateReportEntry({
          canonicalDeviceId: canonical.id,
          duplicateDeviceIds: sorted.slice(1).map((d) => d.id),
          ownership: { accountId: canonical.tenantId },
          storeAssignment: canonical.storeId,
          lastSeenAt: canonical.lastSeenAt?.toISOString?.() || null,
          playlistAssignment: canonical.bindings?.[0]?.playlistId || null,
          reason: 'weak_model_platform_fingerprint_no_installationId',
          safeMergeEligible: false,
        }),
      );
    }

    return res.json({ ok: true, tenantId, storeId: storeId || null, duplicates: reports });
  } catch (error) {
    console.error('[DEVICE_DUPLICATES_REPORT_FAILED]', error);
    return res.status(500).json({ ok: false, error: error.message || 'Failed to build duplicate report' });
  }
});

/**
 * POST /api/device/duplicates/archive
 * Soft-archive confirmed duplicate rows (same-account only unless admin).
 * Body: { canonicalDeviceId, duplicateDeviceIds: string[], tenantId }
 */
router.post('/duplicates/archive', requireAuth, async (req, res) => {
  try {
    const canonicalDeviceId = String(req.body?.canonicalDeviceId || '').trim();
    const duplicateDeviceIds = Array.isArray(req.body?.duplicateDeviceIds)
      ? req.body.duplicateDeviceIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    const tenantId = String(req.body?.tenantId || req.userId || '').trim();

    if (!canonicalDeviceId || duplicateDeviceIds.length === 0 || !tenantId) {
      return res.status(400).json({
        ok: false,
        error: 'canonicalDeviceId, duplicateDeviceIds, and tenantId are required',
      });
    }

    const canonical = await prisma.device.findUnique({ where: { id: canonicalDeviceId } });
    if (!canonical || canonical.tenantId !== tenantId) {
      return res.status(403).json({ ok: false, error: 'Canonical device not owned by account' });
    }

    const archived = [];
    for (const dupId of duplicateDeviceIds) {
      if (dupId === canonicalDeviceId) continue;
      const dup = await prisma.device.findUnique({
        where: { id: dupId },
        include: { capabilities: { take: 1 } },
      });
      if (!dup) continue;
      if (dup.tenantId !== tenantId && dup.tenantId !== 'temp') {
        // Never silently archive another account's device.
        continue;
      }
      const prev =
        dup.capabilities?.[0]?.capabilities && typeof dup.capabilities[0].capabilities === 'object'
          ? dup.capabilities[0].capabilities
          : {};
      await prisma.deviceCapability.upsert({
        where: { deviceId: dupId },
        update: {
          capabilities: {
            ...prev,
            archivedAt: new Date().toISOString(),
            archiveReason: 'duplicate_merge',
            canonicalDeviceId,
          },
        },
        create: {
          deviceId: dupId,
          capabilities: {
            archivedAt: new Date().toISOString(),
            archiveReason: 'duplicate_merge',
            canonicalDeviceId,
          },
        },
      });
      await prisma.device.update({
        where: { id: dupId },
        data: { pairingCode: null, status: 'offline' },
      });
      archived.push(dupId);
      logDeviceIdentityEvent('DUPLICATE_DEVICE_ARCHIVED', {
        deviceId: dupId,
        canonicalDeviceId,
        accountId: tenantId,
        reason: 'duplicate_merge',
      });
    }

    return res.json({ ok: true, canonicalDeviceId, archived });
  } catch (error) {
    console.error('[DEVICE_DUPLICATES_ARCHIVE_FAILED]', error);
    return res.status(500).json({ ok: false, error: error.message || 'Failed to archive duplicates' });
  }
});

/**
 * POST /api/device/cleanup-stale
 * Soft-archive duplicate/stale device rows for a tenant/store (capabilities.archivedAt).
 */
router.post('/cleanup-stale', requireAuth, async (req, res) => {
  try {
    const tenantId = String(req.body?.tenantId || req.query?.tenantId || '').trim();
    const storeId = String(req.body?.storeId || req.query?.storeId || '').trim();

    if (!tenantId || !storeId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required parameters',
        message: 'tenantId and storeId are required',
      });
    }

    const { runDeviceCleanupStale } = await import('../services/deviceCleanupService.js');
    const result = await runDeviceCleanupStale(prisma, { tenantId, storeId });

    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error('[Device Engine] cleanup-stale error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to cleanup stale devices',
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
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      console.error('[REQUEST_PAIRING_FAILED]', {
        reason: 'invalid_input',
        bodyType: typeof req.body,
      });
      return res.status(400).json({
        ok: false,
        error: 'invalid_input',
        message: 'Request body must be a JSON object',
      });
    }

    const result = await executeDeviceRequestPairing({
      body: req.body,
      req,
      source: 'POST /api/device/request-pairing',
    });

    if (result.alreadyPaired) {
      return res.status(200).json({
        ok: true,
        alreadyPaired: true,
        sessionId: result.sessionId,
        deviceId: result.deviceId,
        tenantId: result.tenantId,
        storeId: result.storeId,
        status: 'claimed',
      });
    }

    res.status(200).json({
      ok: true,
      sessionId: result.sessionId,
      code: result.code,
      expiresAt: result.expiresAt,
      deviceId: result.deviceId,
    });
  } catch (error) {
    console.error('[REQUEST_PAIRING_FAILED]', {
      route: 'request-pairing',
      message: error?.message,
    });
    res.status(500).json({
      ok: false,
      error: error?.code || 'pairing_failed',
      message: error?.message || 'Device pairing failed due to an internal error. Please try again.',
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
    console.log('[PAIRING_START] POST /api/device/complete-pairing', {
      hasSessionId: !!(body?.sessionId || body?.deviceId),
      pairingCode: body?.pairingCode ? String(body.pairingCode).slice(0, 2) + '****' : null,
      storeId: body?.storeId || null,
      authUserId: req.user?.id || null,
    });
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
    const pairingCodeRaw = input.pairingCode || body?.pairingCode;
    if (!sessionId && !pairingCodeRaw) {
      console.error('[PAIRING_FAILED]', { reason: 'missing_session_or_code' });
      return res.status(400).json({
        ok: false,
        error: 'missing_fields',
        message: 'sessionId (or deviceId) or pairingCode is required',
      });
    }

    const effectiveInput = {
      ...input,
      tenantId: effectiveTenantId,
      storeId: effectiveStoreId,
      ...(sessionId ? { sessionId } : {}),
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
    console.error('[PAIRING_FAILED]', {
      route: 'complete-pairing',
      message: error?.message,
      name: error?.name,
    });
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
      engineVersion,
      platform,
      tenantId: bodyTenantId,
      storeId: bodyStoreId,
      status: bodyStatus,
      executedCommandIds,
      playbackState,
      alert: alertPayload, // Optional alert payload
    } = body;
    let providedDeviceId = body.deviceId ? String(body.deviceId).trim() : '';
    const bodyInstallationId =
      normalizeInstallationId(body.installationId || body.physicalInstallationId) || '';

    // Default status to "online" if not provided
    const status = bodyStatus || 'online';

    const heartbeatCoreUrl = resolveCoreUrlFromHeartbeat(body, req);
    const heartbeatPlaylistIdHint =
      playbackState?.playlistId || body.currentPlaylistId || body.playlistId || null;

    // Reconcile by stable installation identity before create-on-missing.
    try {
      const resolved = await resolveCanonicalDevice(prisma, {
        deviceId: providedDeviceId,
        installationId: bodyInstallationId,
      });
      if (resolved.device) {
        const capRow = await prisma.deviceCapability.findUnique({
          where: { deviceId: resolved.device.id },
          select: { capabilities: true },
        });
        const meta = readDeviceMetadata(capRow);
        if (isDeviceArchived(meta) || isDeviceArchived(capRow?.capabilities)) {
          logDeviceIdentityEvent('HEARTBEAT_OWNER_MISMATCH', {
            deviceId: resolved.device.id,
            installationId: bodyInstallationId,
            canonicalDeviceId: resolved.device.id,
            reason: 'archived_device_rejected',
          });
          return res.status(409).json({
            ok: false,
            error: 'DEVICE_ARCHIVED',
            message: 'This device installation is archived and cannot accept heartbeats',
            deviceId: resolved.device.id,
          });
        }
        if (providedDeviceId && providedDeviceId !== resolved.device.id) {
          logDeviceIdentityEvent('DEVICE_RECORD_MATCHED', {
            deviceId: providedDeviceId,
            installationId: bodyInstallationId,
            canonicalDeviceId: resolved.device.id,
            reason: `heartbeat_remap:${resolved.matchReason}`,
          });
        } else {
          logDeviceIdentityEvent('DEVICE_RECORD_MATCHED', {
            deviceId: resolved.device.id,
            installationId: bodyInstallationId,
            canonicalDeviceId: resolved.device.id,
            reason: resolved.matchReason || 'heartbeat',
          });
        }
        providedDeviceId = resolved.device.id;
      } else if (!providedDeviceId && bodyInstallationId) {
        // Prefer installationId as the durable device record id for first-seen installs.
        providedDeviceId = bodyInstallationId;
        logDeviceIdentityEvent('DEVICE_RECORD_CREATED', {
          deviceId: providedDeviceId,
          installationId: bodyInstallationId,
          reason: 'heartbeat_will_create_with_installation_id',
        });
      }
    } catch (resolveErr) {
      console.warn('[HEARTBEAT] identity resolve failed (non-fatal):', resolveErr?.message);
    }

    console.log('[DEVICE_HEARTBEAT_RECEIVED]', {
      deviceId: providedDeviceId || null,
      installationIdHash: hashInstallationId(bodyInstallationId),
      coreUrl: heartbeatCoreUrl,
      platform: platform || null,
      engineVersion: engineVersion || body.appVersion || null,
      tenantId: bodyTenantId || null,
      storeId: bodyStoreId || null,
      currentPlaylistId: heartbeatPlaylistIdHint,
      status,
      clientIp: req.ip || req.socket?.remoteAddress || null,
    });

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

          const heartbeatSelect = {
            id: true,
            name: true,
            status: true,
            orientation: true,
            tenantId: true,
            storeId: true,
            lastSeenAt: true,
            platform: true,
            appVersion: true,
            pairingCode: true,
            lastPlaybackReportAt: true,
            playbackReportIsPlaying: true,
            playbackReportState: true,
          };
          const runHeartbeatUpdate = () =>
            prisma.device.update({
              where: { id: deviceId },
              data: updateData,
              select: heartbeatSelect,
            });
          const optimisticDevice = {
            ...currentDevice,
            ...updateData,
            id: deviceId,
            lastSeenAt: now,
          };
          if (hasActiveMissionPipelineExecution()) {
            void runBestEffortSqliteWrite(runHeartbeatUpdate, 'device.heartbeat');
            device = optimisticDevice;
          } else if (isSqliteBestEffortLaneEnabled()) {
            device = await runBestEffortSqliteWriteAwait(runHeartbeatUpdate, 'device.heartbeat');
            if (!device) {
              device = optimisticDevice;
            }
          } else {
            device = await runHeartbeatUpdate();
          }

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
            try {
              const { emitPlatformActivity } = await import('../lib/platformActivity/platformActivityEmitter.js');
              emitPlatformActivity({
                type: 'device_paired',
                severity: 'success',
                actorType: 'device',
                actorId: device.id,
                entityType: 'device',
                entityId: device.id,
                title: 'Device paired',
                message: `${device.name || 'Display'} connected to C-Net.`,
                route: '/marketing#device-network',
                metadata: { platform: device.platform, tenantId: device.tenantId, storeId: device.storeId },
              });
            } catch {
              /* non-fatal */
            }
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

    // Ensure pairingCode / installationId are available for CLAIMABLE response (selects often omit them).
    if (device?.id) {
      try {
        const fresh = await prisma.device.findUnique({
          where: { id: device.id },
          select: {
            id: true,
            name: true,
            status: true,
            orientation: true,
            tenantId: true,
            storeId: true,
            pairingCode: true,
            lastSeenAt: true,
            platform: true,
            appVersion: true,
            lastPlaybackReportAt: true,
            playbackReportIsPlaying: true,
            playbackReportState: true,
          },
        });
        if (fresh) {
          device = { ...device, ...fresh };
        }
      } catch (freshErr) {
        console.warn('[HEARTBEAT] refresh device fields failed (non-fatal):', freshErr?.message);
      }
    }

    // Compute pairingStatus (align with playlist/full active binding rules)
    let pairingStatus = 'UNPAIRED';

    const deviceBindings = await prisma.devicePlaylistBinding.findMany({
      where: { deviceId: device.id },
      orderBy: { lastPushedAt: 'desc' },
      take: 8,
    });
    const activeBinding = pickActivePlaylistBinding(deviceBindings);

    if (activeBinding) {
      pairingStatus = 'PAIRED_PLAYLIST_ASSIGNED';
    } else if (
      device.tenantId &&
      device.storeId &&
      device.tenantId !== 'temp' &&
      device.storeId !== 'temp' &&
      !device.pairingCode
    ) {
      pairingStatus = 'PAIRED_NO_PLAYLIST';
    } else if (
      device.pairingCode &&
      (device.tenantId === 'temp' || device.storeId === 'temp')
    ) {
      pairingStatus = 'CLAIMABLE';
    }

    if (bodyInstallationId) {
      try {
        await persistInstallationId(prisma, device.id, bodyInstallationId, {
          pairingStatus,
        });
      } catch (persistErr) {
        console.warn('[HEARTBEAT] persistInstallationId failed (non-fatal):', persistErr?.message);
      }
    }

    // If heartbeat carries owner context that does not match paired device, log (do not mutate).
    if (
      device.tenantId !== 'temp' &&
      bodyTenantId &&
      bodyTenantId !== 'temp' &&
      bodyTenantId !== device.tenantId
    ) {
      logDeviceIdentityEvent('HEARTBEAT_OWNER_MISMATCH', {
        deviceId: device.id,
        accountId: device.tenantId,
        storeId: device.storeId,
        installationId: bodyInstallationId,
        reason: `bodyTenant=${bodyTenantId}`,
      });
    }

    try {
      const meta = await upsertDeviceMetadata(prisma, device.id, {
        ...(heartbeatCoreUrl ? { coreUrl: heartbeatCoreUrl } : {}),
        ...(engineVersion || body.appVersion
          ? { engineVersion: engineVersion || body.appVersion }
          : {}),
        ...(platform ? { platform } : {}),
        pairingStatus,
        ...(activeBinding?.playlistId || heartbeatPlaylistIdHint
          ? {
              currentPlaylistId:
                activeBinding?.playlistId || heartbeatPlaylistIdHint,
            }
          : {}),
      });
      console.log('[DEVICE_METADATA_UPDATED]', {
        deviceId: device.id,
        coreUrl: meta?.coreUrl || heartbeatCoreUrl,
        pairingStatus: meta?.pairingStatus,
        currentPlaylistId: meta?.currentPlaylistId,
        engineVersion: meta?.engineVersion,
      });
    } catch (metaErr) {
      console.warn('[DEVICE_METADATA_UPDATED] failed (non-fatal):', metaErr?.message || metaErr);
    }

    logDeviceIdentityEvent('HEARTBEAT_ACCEPTED', {
      deviceId: device.id,
      installationId: bodyInstallationId,
      accountId: device.tenantId,
      storeId: device.storeId,
      playlistId: activeBinding?.playlistId || null,
      pairingStatus,
      canonicalDeviceId: device.id,
    });

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
      currentPlaylistId: activeBinding?.playlistId || heartbeatPlaylistIdHint || null,
      installationIdHash: hashInstallationId(
        bodyInstallationId || device.installationId || null,
      ),
      // Expose pairing code only when claimable so TV can show it after release.
      ...(pairingStatus === 'CLAIMABLE' && device.pairingCode
        ? { pairingCode: device.pairingCode }
        : {}),
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
      coreUrl: heartbeatCoreUrl || null,
      currentPlaylistId: activeBinding?.playlistId || heartbeatPlaylistIdHint || null,
      playlistId: activeBinding?.playlistId || null,
      playlist: activeBinding
        ? {
            playlistId: activeBinding.playlistId,
            version: activeBinding.version,
            status: activeBinding.status,
            lastPushedAt: activeBinding.lastPushedAt,
          }
        : null,
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
    const validTypes = [
      'play',
      'pause',
      'next',
      'previous',
      'reload',
      'reloadPlaylist',
      'setPlaylistIndex',
      'setVolume',
      'setBrightness',
      'screenshot',
      'returnHome',
      'RETURN_HOME',
    ];
    const normalizedType = type === 'reload' ? 'reloadPlaylist' : type;
    if (!normalizedType || !validTypes.includes(normalizedType)) {
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
    const cmd = await enqueueDeviceCommand(deviceId, normalizedType, payload ?? {});

    console.log('[Device Engine] Queued command', { deviceId, type: normalizedType, commandId: cmd.id });

    // Log command queued
    await addDeviceLog({
      deviceId,
      source: 'command',
      level: 'info',
      message: `Command queued: ${normalizedType}`,
      payload: payload ?? {},
    });

    // Broadcast SSE event: "device.command.queued"
    broadcastSse(
      device.tenantId,
      'device.command.queued',
      {
        deviceId,
        commandId: cmd.id,
        type: normalizedType,
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
async function handlePushPlaylistAssign(req, res) {
  try {
    console.log('[Device Engine] POST playlist assign', { body: req.body, path: req.path });

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

    const payload = result?.data
      ? { ok: true, data: result.data }
      : { ok: true, data: result };
    res.json(payload);
  } catch (error) {
    console.error('[PLAYLIST_ASSIGN_FAILED]', {
      deviceId: req.body?.deviceId ?? req.params?.deviceId,
      playlistId: req.body?.playlistId,
      message: error?.message,
    });
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
    if (code === 'PLAYLIST_STORE_MISMATCH') {
      return res.status(403).json({
        ok: false,
        error: error.message || 'Playlist store mismatch',
        code: 'PLAYLIST_STORE_MISMATCH',
      });
    }
    if (code === 'PLAYLIST_EMPTY_URLS') {
      return res.status(400).json({
        ok: false,
        error: error.message || 'Playlist has no playable media URLs',
        code: 'PLAYLIST_EMPTY_URLS',
      });
    }
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to push playlist',
    });
  }
}

/**
 * POST /api/device/push-playlist
 * Assign playlist to device (Dashboard-initiated, requires auth)
 */
router.post('/push-playlist', requireAuth, handlePushPlaylistAssign);

/**
 * POST /api/device/:deviceId/playlist/assign
 * Canonical alias for push-playlist (deviceId in path)
 */
router.post('/:deviceId/playlist/assign', requireAuth, async (req, res) => {
  const pathDeviceId =
    typeof req.params.deviceId === 'string' ? req.params.deviceId.trim() : '';
  if (pathDeviceId && !req.body?.deviceId) {
    req.body = { ...req.body, deviceId: pathDeviceId };
  }
  return handlePushPlaylistAssign(req, res);
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

    try {
      const { verifyScreenshotCommands } = await import('../services/cnet/remoteCommandService.js');
      await verifyScreenshotCommands(deviceId, updated.lastScreenshotAt);
      broadcastSse('admin', 'DEVICE_SCREENSHOT_UPDATED', {
        deviceId,
        lastScreenshotAt: updated.lastScreenshotAt?.toISOString?.() || null,
      });
    } catch (verifyErr) {
      console.warn('[Device Engine] screenshot verify remote cmds:', verifyErr?.message);
    }

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
        updatedAt: true,
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
    
    const {
      pairingExpiresAt,
      pairingTtlLeftMs,
      isPairingSessionExpired,
      loadPairingCodeIssuedAt,
    } = await import('../engines/device/pairingSessionTiming.js');
    const pairingCodeIssuedAt = await loadPairingCodeIssuedAt(prisma, device.id);
    const now = new Date();
    const expiresAt = pairingExpiresAt(device, pairingCodeIssuedAt);
    const expired = isPairingSessionExpired(device, now, pairingCodeIssuedAt);
    
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
      ttlLeftMs: pairingTtlLeftMs(device, now, pairingCodeIssuedAt),
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
 * POST /api/device/claim-pending
 * Claim a pending unpaired Device V2 row (temp/temp) into the authenticated tenant + selected store.
 * Used by the dashboard "Claim" button on New / Unpaired Devices — does not require a live pairing code
 * (codes expire while the temp row can remain visible).
 *
 * Body: { deviceId: string, storeId: string, name?: string, location?: string }
 */
router.post('/claim-pending', requireAuth, async (req, res) => {
  const requestId = Math.random().toString(36).slice(2, 9);
  try {
    const authTenantId = req.user?.id || null;
    if (!authTenantId) {
      return res.status(401).json({
        ok: false,
        error: 'unauthorized',
        message: 'Authentication required to claim a device',
      });
    }

    const deviceId = String(req.body?.deviceId || req.body?.sessionId || '').trim();
    const storeId = String(req.body?.storeId || '').trim();
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const location = typeof req.body?.location === 'string' ? req.body.location.trim() : '';

    if (!deviceId) {
      return res.status(400).json({
        ok: false,
        error: 'missing_fields',
        message: 'deviceId is required',
      });
    }
    if (!storeId || storeId === 'temp') {
      return res.status(400).json({
        ok: false,
        error: 'missing_fields',
        message: 'storeId is required (select a store in the dashboard)',
      });
    }

    console.log(`[DeviceEngine V2] [${requestId}] claim-pending`, {
      deviceId,
      storeId,
      tenantId: authTenantId,
    });

    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) {
      return res.status(404).json({
        ok: false,
        error: 'session_not_found',
        message: 'Device not found',
      });
    }

    const isPending =
      device.tenantId === 'temp' ||
      device.storeId === 'temp' ||
      !!device.pairingCode;

    if (!isPending) {
      // Already claimed — idempotent success if same tenant/store
      if (device.tenantId === authTenantId && device.storeId === storeId) {
        return res.json({
          ok: true,
          alreadyPaired: true,
          deviceId: device.id,
          data: { device },
        });
      }
      return res.status(400).json({
        ok: false,
        error: 'already_paired',
        message: 'Device is already paired to another store. Use Repair / Unpair first.',
      });
    }

    const now = new Date();
    const updated = await prisma.device.update({
      where: { id: device.id },
      data: {
        tenantId: authTenantId,
        storeId,
        name: name || device.name || null,
        location: location || device.location || null,
        pairingCode: null,
        status: device.lastSeenAt ? device.status || 'online' : 'offline',
        lastSeenAt: device.lastSeenAt || now,
        appVersion: device.appVersion || 'DEVICE_V2',
      },
    });

    if (
      !updated.tenantId ||
      updated.tenantId === 'temp' ||
      !updated.storeId ||
      updated.storeId === 'temp'
    ) {
      return res.status(500).json({
        ok: false,
        error: 'pairing_commit_failed',
        message: 'Claim did not commit tenant/store identity',
      });
    }

    console.log(`[DeviceEngine V2] [${requestId}] claim-pending OK`, {
      deviceId: updated.id,
      tenantId: updated.tenantId,
      storeId: updated.storeId,
    });

    try {
      broadcastSse('admin', 'device:paired', {
        deviceId: updated.id,
        name: updated.name,
        platform: updated.platform || null,
        type: updated.type || 'screen',
        status: updated.status,
        lastSeenAt: updated.lastSeenAt?.toISOString() || null,
        tenantId: updated.tenantId,
        storeId: updated.storeId,
      });
      broadcastSse('admin', 'device:update', {
        deviceId: updated.id,
        status: updated.status,
        lastSeenAt: updated.lastSeenAt?.toISOString() || null,
        tenantId: updated.tenantId,
        storeId: updated.storeId,
        name: updated.name,
      });
    } catch (sseErr) {
      console.warn(`[DeviceEngine V2] [${requestId}] SSE emit failed (non-fatal):`, sseErr?.message);
    }

    res.json({
      ok: true,
      deviceId: updated.id,
      data: {
        device: {
          id: updated.id,
          tenantId: updated.tenantId,
          storeId: updated.storeId,
          name: updated.name,
          status: updated.status,
          platform: updated.platform,
          type: updated.type || 'screen',
          lastSeenAt: updated.lastSeenAt,
        },
      },
    });
  } catch (error) {
    console.error('[Device Engine] claim-pending error:', error);
    res.status(500).json({
      ok: false,
      error: error?.message || 'claim_failed',
      message: error?.message || 'Failed to claim pending device',
    });
  }
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

    const {
      pairingExpiresAt,
      isPairingSessionExpired,
      loadPairingCodeIssuedAt,
    } = await import('../engines/device/pairingSessionTiming.js');
    const pairingCodeIssuedAt = await loadPairingCodeIssuedAt(prisma, device.id);
    const now = new Date();
    const expiresAt = pairingExpiresAt(device, pairingCodeIssuedAt);

    if (isPairingSessionExpired(device, now, pairingCodeIssuedAt)) {
      console.warn(`[DeviceEngine V2] [${requestId}] Pairing code expired`, {
        sessionId,
        pairingCodeIssuedAt,
        updatedAt: device.updatedAt?.toISOString?.() || device.updatedAt,
        createdAt: device.createdAt?.toISOString?.() || device.createdAt,
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

    console.log(`[PAIRING_COMPLETE]`, {
      deviceId: updated.id,
      tenantId: updated.tenantId,
      storeId: updated.storeId,
    });

    if (
      !updated.tenantId ||
      updated.tenantId === 'temp' ||
      !updated.storeId ||
      updated.storeId === 'temp'
    ) {
      console.error('[PAIRING_FAILED] CRITICAL: claim succeeded but identity still temp', {
        deviceId: updated.id,
        tenantId: updated.tenantId,
        storeId: updated.storeId,
      });
      return res.status(500).json({
        ok: false,
        error: 'pairing_commit_failed',
        message: 'Pairing did not commit tenant/store identity. Please retry pairing.',
      });
    }

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
    
    console.log('[PLAYLIST_FULL_REQUEST]', {
      requestId,
      deviceIdParamRaw: rawDeviceId,
      deviceIdNormalized: normalizedDeviceId,
      path: req.path,
      host: req.get?.('host') || null,
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

    let latestBinding = pickPlaylistBindingForPlayback(allBindings);

    // Recover from capability metadata when DB binding rows were lost but device
    // (or optimistic dashboard) still reports a playlist id.
    if (!latestBinding) {
      try {
        const capRow = await prisma.deviceCapability.findUnique({
          where: { deviceId: canonicalDeviceId },
          select: { capabilities: true },
        });
        const meta = readDeviceMetadata(capRow);
        if (meta.currentPlaylistId) {
          latestBinding = {
            id: null,
            playlistId: meta.currentPlaylistId,
            status: 'pending',
            lastPushedAt: null,
            version: '1',
            _recoveredFromMetadata: true,
          };
          console.warn(`[Device Engine] [${requestId}] Recovered playlistId from device capability metadata`, {
            deviceId: canonicalDeviceId,
            playlistId: meta.currentPlaylistId,
          });
        }
      } catch (metaErr) {
        console.warn(`[Device Engine] [${requestId}] metadata recovery failed (non-fatal)`, {
          error: metaErr?.message || String(metaErr),
        });
      }
    }

    if (latestBinding) {
      console.log('[PLAYLIST_FULL_BINDING_FOUND]', {
        requestId,
        deviceId: canonicalDeviceId,
        bindingId: latestBinding.id,
        playlistId: latestBinding.playlistId,
        status: latestBinding.status,
        recoveredFromMetadata: Boolean(latestBinding._recoveredFromMetadata),
        tenantId: device.tenantId,
        storeId: device.storeId,
      });
    }

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
      
      const noBindingBody = applyAndroidPlaylistFullCompat({
        ok: true,
        deviceId: canonicalDeviceId,
        state,
        message,
        playlist: null,
        items: [],
      });
      console.log('[PLAYLIST_FULL_RESPONSE]', {
        requestId,
        deviceId: canonicalDeviceId,
        state: noBindingBody.state,
        itemCount: 0,
        playlistId: null,
      });
      return res.json(noBindingBody);
    }

    // Heal failed / stale statuses so subsequent polls see an active binding
    if (
      latestBinding.id &&
      !isActivePlaylistBindingStatus(latestBinding.status)
    ) {
      try {
        await prisma.devicePlaylistBinding.update({
          where: { id: latestBinding.id },
          data: { status: 'pending', lastPushedAt: new Date() },
        });
        latestBinding = { ...latestBinding, status: 'pending' };
        console.log(`[Device Engine] [${requestId}] Healed inactive binding → pending`, {
          bindingId: latestBinding.id,
          playlistId: latestBinding.playlistId,
        });
      } catch (healErr) {
        console.warn(`[Device Engine] [${requestId}] Binding heal failed (non-fatal)`, {
          error: healErr?.message || String(healErr),
        });
      }
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
    let deviceMetaForUrls = null;
    try {
      const capRow = await prisma.deviceCapability.findUnique({
        where: { deviceId: canonicalDeviceId },
        select: { capabilities: true },
      });
      deviceMetaForUrls = readDeviceMetadata(capRow);
    } catch {
      /* non-fatal */
    }
    const playlistMediaBase = resolvePlaylistMediaBaseUrl(req, deviceMetaForUrls);
    if (!playlistMediaBase) {
      console.error(`[Device Engine] [${requestId}] playlist/full missing DEVICE_PUBLIC_BASE_URL`, {
        deviceId: canonicalDeviceId,
        hint: 'Set DEVICE_PUBLIC_BASE_URL=http://<lan-ip>:3001 in core .env',
      });
    }

    /** @param {string} itemUrl @param {object} logCtx */
    const resolveItemUrl = (itemUrl, logCtx) => {
      const resolvedUrl = resolvePlaylistItemMediaUrl(itemUrl, playlistMediaBase, {
        ...logCtx,
        deviceId: canonicalDeviceId,
        requestId,
      });
      if (!resolvedUrl) {
        console.error(`[Device Engine] [${requestId}] Failed to build playlist media URL:`, {
          ...logCtx,
          originalUrl: itemUrl,
          playlistMediaBase,
        });
        return null;
      }
      try {
        new URL(resolvedUrl);
        const host = new URL(resolvedUrl).hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
          console.error(`[Device Engine] [${requestId}] Refusing loopback playlist media URL:`, {
            resolvedUrl,
            playlistMediaBase,
          });
          return null;
        }
      } catch (urlError) {
        console.error(`[Device Engine] [${requestId}] Invalid playlist media URL:`, {
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
          let itemUrl = asset.url;
          if (itemType === 'video' && itemUrl) {
            const tvSafe = preferTvSafeVideoPublicPath(itemUrl);
            if (tvSafe && tvSafe !== itemUrl) {
              console.log(`[Device Engine] [${requestId}] Using TV-safe video derivative`, {
                itemId: item.id,
                assetId: asset.id,
                original: itemUrl,
                tvSafe,
              });
              itemUrl = tvSafe;
            }
          }
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
          const originalUrl = media.url || '';
          if (kind === 'video' && media.optimizedUrl && media.isOptimized === true) {
            itemUrl = media.optimizedUrl;
          }
          if (kind === 'video') {
            const tvSafe = preferTvSafeVideoPublicPath(originalUrl || itemUrl);
            if (tvSafe && tvSafe !== itemUrl) {
              console.log(`[Device Engine] [${requestId}] Using TV-safe video derivative`, {
                itemId: item.id,
                mediaId: media.id,
                original: itemUrl,
                tvSafe,
              });
              itemUrl = tvSafe;
            }
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
            ...(kind === 'video' && originalUrl && originalUrl !== itemUrl
              ? { fallbackUrl: resolveItemUrl(originalUrl, { itemId: item.id, mediaId: media.id, role: 'fallback' }) }
              : {}),
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
    
    console.log('[PLAYLIST_FULL_ITEMS_FOUND]', {
      requestId,
      deviceId: canonicalDeviceId,
      playlistId: playlist.id,
      rawItemCount: playlist.items?.length ?? 0,
      playableItemCount: itemsWithRefs.length,
      playlistType: playlistTypeUpper,
    });

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
    
    const rawItemCount = playlist?.items?.length ?? 0;

    // Empty assigned playlist — accurate state (not "pending confirmation")
    if (playlist && items.length === 0) {
      response.state = 'assigned_empty_playlist';
      response.message = 'Playlist assigned but contains no playable items';
      response.playlist = null;
      response.rawItemCount = rawItemCount;
    }

    // Playable items: return playlist even when binding is still pending
    if (playlist && items.length > 0 && bindingSt === 'pending') {
      response.state = 'ready';
      response.message = 'Playlist ready for playback';
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
    
    const responseItemsBeforeCompat = response.playlist?.items ?? [];
    console.log('[PLAYLIST_PLAYBACK]', {
      deviceId: canonicalDeviceId,
      bindingId: latestBinding?.id ?? null,
      bindingPlaylistId: latestBinding?.playlistId ?? null,
      playlistId: playlist?.id ?? null,
      playlistItemCount: rawItemCount,
      playableItemCount: items.length,
      responseItemCount: responseItemsBeforeCompat.length,
      firstItemUrl: responseItemsBeforeCompat[0]?.url ?? null,
      hasPlayableItems: responseItemsBeforeCompat.length > 0,
      coreBaseUrl: playlistMediaBase,
      state: response.state,
    });

    applyAndroidPlaylistFullCompat(response);

    // Re-apply canonical base on final payload (idempotent when items already built with playlistMediaBase)
    if (playlistMediaBase && response.playlist && Array.isArray(response.playlist.items)) {
      response.playlist.items = response.playlist.items.map((item) => {
        const url = resolvePlaylistItemMediaUrl(item.url, playlistMediaBase, {
          itemId: item.id,
          deviceId: canonicalDeviceId,
          pass: 'final',
        });
        return url ? { ...item, url, mediaUrl: url } : item;
      });
      if (response.previewUrl) {
        response.previewUrl =
          resolvePlaylistItemMediaUrl(response.previewUrl, playlistMediaBase, {
            deviceId: canonicalDeviceId,
            pass: 'preview',
          }) || response.previewUrl;
      }
    }
    if (playlistMediaBase && Array.isArray(response.items)) {
      response.items = response.items.map((item) => {
        const url = resolvePlaylistItemMediaUrl(item.url || item.mediaUrl, playlistMediaBase, {
          itemId: item.id,
          deviceId: canonicalDeviceId,
          pass: 'final-top-level',
        });
        return url ? { ...item, url, mediaUrl: url } : item;
      });
    }
    if (playlistMediaBase) {
      response.coreBaseUrl = playlistMediaBase;
    }

    if (response.playlist?.items?.length > 0) {
      console.log('[DeviceEngine V2] Playlist sample URL:', response.playlist.items[0]?.url);
    }

    const compatItems = Array.isArray(response.items) ? response.items : [];
    console.log('[PLAYLIST_FULL_RESPONSE]', {
      requestId,
      deviceId: canonicalDeviceId,
      state: response.state,
      itemCount: compatItems.length,
      playlistId: response.playlistId ?? response.playlist?.id ?? null,
      playlistName: response.playlistName ?? response.playlist?.name ?? null,
      bindingStatus: response.bindingStatus ?? null,
      hasTopLevelItems: compatItems.length > 0,
    });

    console.log(`[Device Engine] [${requestId}] playlist/full response`, {
      deviceId: canonicalDeviceId,
      state: response.state,
      message: response.message,
      hasPlaylist: !!response.playlist,
      itemCount: compatItems.length,
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

    const { deviceId, deviceType, ip, reason: rawReason, code, sessionId, expiresAt } = parsed.data;
    const reason = rawReason === 'pairing_code_ready' ? 'pair_request' : rawReason;

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
        pairingCode: true,
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

    const isPairingSignal = reason === 'pair_request';
    if (
      !isPairingSignal &&
      binding &&
      binding.status &&
      !['pending', 'ready'].includes(binding.status)
    ) {
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
    const resolvedCode = code || device.pairingCode || null;
    const resolvedSessionId = sessionId || device.id;
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
      sessionId: resolvedSessionId,
      code: resolvedCode,
      expiresAt: expiresAt || null,
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
          take: 8,
        },
        capabilities: true,
      },
    });

    if (!device) {
      return res.status(404).json({
        ok: false,
        error: 'device_not_found',
        message: 'Device not found',
      });
    }

    const metadata = readDeviceMetadata(device.capabilities?.[0]);
    const activeBinding = pickActivePlaylistBinding(device.bindings || []);

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
        coreUrl: metadata.coreUrl,
        engineVersion: metadata.engineVersion || device.appVersion,
        pairingStatus: metadata.pairingStatus || derivePairingStatus(device),
        currentPlaylistId: activeBinding?.playlistId || metadata.currentPlaylistId,
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
      try {
        const { emitPlatformActivity } = await import('../lib/platformActivity/platformActivityEmitter.js');
        emitPlatformActivity({
          type: 'device_paired',
          severity: 'success',
          actorType: 'device',
          actorId: device.id,
          entityType: 'device',
          entityId: device.id,
          title: 'Device paired',
          message: `${device.name || 'Display'} connected to C-Net.`,
          route: '/marketing#device-network',
          metadata: { platform: device.platform, tenantId: pairing.tenantId, storeId: pairing.storeId },
        });
      } catch {
        /* non-fatal */
      }
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
 * GET /api/device/compatibility
 * Device V2 APK compatibility probe (no auth).
 */
router.get('/compatibility', (req, res) => {
  const engine = String(req.query.engine || 'DEVICE_V2').toUpperCase();
  const apkVersion = String(req.query.apkVersion || 'unknown');
  res.json({
    ok: true,
    minSupportedApkVersion: '1.0',
    currentCoreVersion: process.env.CORE_VERSION || process.env.npm_package_version || 'dev',
    supportedEngines: ['DEVICE_V2', 'LEGACY'],
    pairingProtocolVersion: '2',
    engineSupported: engine.includes('DEVICE'),
    requestedEngine: engine,
    requestedApkVersion: apkVersion,
  });
});

/**
 * POST /api/device/self-repair
 * Device-initiated pairing reset (no auth — same trust model as request-pairing).
 */
router.post('/self-repair', async (req, res, next) => {
  try {
    const { deviceId } = req.body || {};
    if (!deviceId || !String(deviceId).trim()) {
      return res.status(422).json({
        ok: false,
        error: 'invalid_payload',
        message: 'deviceId is required',
      });
    }

    const id = String(deviceId).trim();
    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) {
      return res.status(404).json({
        ok: false,
        error: 'device_not_found',
        message: 'Device not registered — start new pairing',
      });
    }

    const isPaired =
      device.tenantId &&
      device.tenantId !== 'temp' &&
      device.storeId &&
      device.storeId !== 'temp' &&
      (device.status === 'online' || device.status === 'paired');

    if (isPaired) {
      return res.status(409).json({
        ok: false,
        error: 'device_already_paired',
        message: 'Device already paired — unpair from dashboard or restart pairing',
      });
    }

    const pairingCode = crypto.randomBytes(3).toString('hex').toUpperCase().substring(0, 6);
    await prisma.device.update({
      where: { id },
      data: {
        status: 'offline',
        pairingCode,
        lastSeenAt: new Date(),
      },
    });

    res.json({
      ok: true,
      message: 'Device repair completed — pairing reset on Core',
      actions: ['reset_pairing', 'cleared_repair_state'],
      deviceId: id,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/device/pair-complete
 * APK alias: acknowledge device-side pairing after poll returned credentials.
 */
router.post('/pair-complete', async (req, res) => {
  const { sessionId, screenId, deviceId, token, code } = req.body || {};
  const id = String(sessionId || screenId || deviceId || '').trim();
  if (!id) {
    return res.status(422).json({
      ok: false,
      error: 'missing_fields',
      message: 'sessionId, screenId, or deviceId is required',
    });
  }

  const device = await prisma.device.findUnique({ where: { id } });
  if (!device) {
    return res.status(404).json({
      ok: false,
      error: 'device_not_found',
      message: 'Device not found',
    });
  }

  res.json({
    ok: true,
    screenId: device.id,
    deviceId: device.id,
    token: token || null,
    code: code || null,
    status: device.status,
  });
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
