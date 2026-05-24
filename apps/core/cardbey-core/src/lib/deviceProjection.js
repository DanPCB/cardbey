/**
 * Canonical Device Engine V2 projection — heartbeat metadata → list/SSE/dashboard DTO.
 */

import { getBaseUrlFromRequest, isCloudFrontUrl } from '../utils/publicUrl.js';
import { getCoreBaseUrl as getRequestCoreBaseUrl } from '../utils/mediaUrlNormalizer.js';
import { isActivePlaylistBindingStatus } from '../utils/playlistFullAndroidCompat.js';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** @param {string} hostname */
function isLoopbackHostname(hostname) {
  return LOOPBACK_HOSTNAMES.has(String(hostname || '').toLowerCase());
}

/**
 * Canonical public base for device-playable media (playlist/full, TV, preview).
 * Never returns localhost — use DEVICE_PUBLIC_BASE_URL for LAN deployments.
 * @param {import('express').Request} [req]
 * @param {{ coreUrl?: string | null } | null} [deviceMeta]
 */
export function resolvePlaylistMediaBaseUrl(req, deviceMeta = null) {
  const candidates = [
    process.env.DEVICE_PUBLIC_BASE_URL,
    deviceMeta?.coreUrl,
    process.env.CORE_BASE_URL,
    process.env.PUBLIC_API_BASE_URL,
    process.env.PUBLIC_BASE_URL,
    getRequestCoreBaseUrl(req),
  ];

  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string' || !String(raw).trim()) continue;
    try {
      const normalized = normalizeCoreUrlString(raw.trim());
      const host = new URL(normalized).hostname;
      if (isLoopbackHostname(host)) continue;
      return normalized;
    } catch {
      continue;
    }
  }

  console.warn('[resolvePlaylistMediaBaseUrl] No non-loopback base URL; set DEVICE_PUBLIC_BASE_URL');
  return null;
}

/** @deprecated Use resolvePlaylistMediaBaseUrl for playlist/full */
export function resolveDevicePublicBaseUrl(req, deviceMeta = null) {
  return resolvePlaylistMediaBaseUrl(req, deviceMeta);
}

/**
 * Build absolute media URL for devices using canonical base only (no Host guessing on client).
 * @param {string} storedUrlOrPath - DB path or legacy absolute URL
 * @param {string} mediaBase - from resolvePlaylistMediaBaseUrl
 * @param {Record<string, unknown>} [logCtx]
 */
export function resolvePlaylistItemMediaUrl(storedUrlOrPath, mediaBase, logCtx = {}) {
  if (!storedUrlOrPath || typeof storedUrlOrPath !== 'string') return null;
  const raw = storedUrlOrPath.trim();
  if (!raw) return null;

  if (isCloudFrontUrl(raw)) {
    console.log('[PLAYLIST_MEDIA_FINAL_URL]', {
      ...logCtx,
      source: 'cloudfront',
      stored: raw,
      finalUrl: raw,
    });
    return raw;
  }

  if (!mediaBase) {
    console.warn('[PLAYLIST_MEDIA_FINAL_URL]', {
      ...logCtx,
      stored: raw,
      error: 'missing_media_base',
    });
    return null;
  }

  let pathPart = raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const u = new URL(raw);
      pathPart = `${u.pathname}${u.search}${u.hash}`;
    } catch {
      return null;
    }
  }

  if (!pathPart.startsWith('/')) {
    pathPart = `/${pathPart.replace(/^\/+/, '')}`;
  }

  const base = mediaBase.replace(/\/+$/, '');
  const finalUrl = `${base}${pathPart}`;

  console.log('[PLAYLIST_MEDIA_FINAL_URL]', {
    ...logCtx,
    stored: raw,
    mediaBase: base,
    finalUrl,
  });

  return finalUrl;
}

/**
 * Resolve the API base URL the device is using (TV overlay / heartbeat).
 * @param {Record<string, unknown>} body
 * @param {import('express').Request} [req]
 */
export function resolveCoreUrlFromHeartbeat(body = {}, req = null) {
  const candidates = [
    body.coreUrl,
    body.coreBaseUrl,
    body.apiBaseUrl,
    body.apiUrl,
    body.config?.coreUrl,
    body.config?.apiBaseUrl,
    body.config?.apiBaseUrl,
  ];
  for (const raw of candidates) {
    if (typeof raw === 'string' && raw.trim()) {
      return normalizeCoreUrlString(raw.trim());
    }
  }
  if (req) {
    try {
      return normalizeCoreUrlString(getBaseUrlFromRequest(req));
    } catch {
      /* fall through */
    }
  }
  return null;
}

/** @param {string} url */
function normalizeCoreUrlString(url) {
  let u = url.replace(/\/+$/, '');
  u = u.replace(/\/api\/?$/i, '');
  if (!/^https?:\/\//i.test(u)) {
    u = `http://${u.replace(/^\/+/, '')}`;
  }
  return u;
}

/**
 * @param {{ tenantId?: string | null, storeId?: string | null, pairingCode?: string | null }} device
 */
export function derivePairingStatus(device) {
  if (!device) return 'unknown';
  if (device.pairingCode) return 'waiting_for_pairing';
  if (
    device.tenantId &&
    device.storeId &&
    device.tenantId !== 'temp' &&
    device.storeId !== 'temp'
  ) {
    return 'paired';
  }
  return 'unpaired';
}

/**
 * @param {Array<{ status?: string, lastPushedAt?: Date | string, [key: string]: unknown }>} bindings
 */
export function pickActivePlaylistBinding(bindings = []) {
  if (!Array.isArray(bindings) || bindings.length === 0) return null;
  const sorted = [...bindings].sort((a, b) => {
    const ta = a.lastPushedAt ? new Date(a.lastPushedAt).getTime() : 0;
    const tb = b.lastPushedAt ? new Date(b.lastPushedAt).getTime() : 0;
    return tb - ta;
  });
  return sorted.find((b) => isActivePlaylistBindingStatus(b.status)) || null;
}

/**
 * @param {{ capabilities?: unknown } | null | undefined} capabilityRow
 */
export function readDeviceMetadata(capabilityRow) {
  const caps =
    capabilityRow?.capabilities && typeof capabilityRow.capabilities === 'object'
      ? /** @type {Record<string, unknown>} */ (capabilityRow.capabilities)
      : {};
  return {
    coreUrl: typeof caps.coreUrl === 'string' ? caps.coreUrl : null,
    engineVersion:
      typeof caps.engineVersion === 'string'
        ? caps.engineVersion
        : typeof caps.appVersion === 'string'
          ? caps.appVersion
          : null,
    pairingStatus: typeof caps.pairingStatus === 'string' ? caps.pairingStatus : null,
    currentPlaylistId:
      typeof caps.currentPlaylistId === 'string' ? caps.currentPlaylistId : null,
    lastHeartbeatAt:
      typeof caps.lastHeartbeatAt === 'string' ? caps.lastHeartbeatAt : null,
    archivedAt:
      typeof caps.archivedAt === 'string' ? caps.archivedAt : null,
    archiveReason:
      typeof caps.archiveReason === 'string' ? caps.archiveReason : null,
  };
}

/**
 * Persist device-reported metadata (DeviceCapability JSON — no schema migration).
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function upsertDeviceMetadata(prisma, deviceId, patch) {
  if (!deviceId || !patch || typeof patch !== 'object') return null;

  const existing = await prisma.deviceCapability.findUnique({
    where: { deviceId },
    select: { capabilities: true },
  });

  const prev =
    existing?.capabilities && typeof existing.capabilities === 'object'
      ? /** @type {Record<string, unknown>} */ (existing.capabilities)
      : {};

  const capabilities = {
    ...prev,
    ...patch,
    lastHeartbeatAt: patch.lastHeartbeatAt || new Date().toISOString(),
  };

  const row = await prisma.deviceCapability.upsert({
    where: { deviceId },
    update: { capabilities },
    create: { deviceId, capabilities },
    select: { capabilities: true },
  });

  return readDeviceMetadata(row);
}

/**
 * Build canonical device DTO fields for list/SSE/debug.
 */
export function buildProjectedDeviceFields({
  device,
  latestBinding,
  latestSnapshot,
  playlistName,
  presence,
  metadata,
}) {
  const pairingStatus =
    metadata?.pairingStatus || derivePairingStatus(device);
  const playlistId =
    latestBinding?.playlistId || metadata?.currentPlaylistId || null;

  return {
    coreUrl: metadata?.coreUrl || null,
    engineVersion: metadata?.engineVersion || device.appVersion || null,
    pairingStatus,
    currentPlaylistId: playlistId,
    playlistId,
    playlistName: playlistName || null,
    playlist: latestBinding
      ? {
          playlistId: latestBinding.playlistId,
          version: latestBinding.version,
          status: latestBinding.status,
          lastPushedAt: latestBinding.lastPushedAt,
        }
      : null,
    playbackReady:
      !!latestBinding &&
      isActivePlaylistBindingStatus(latestBinding.status) &&
      !!playlistId,
    lastSnapshot: latestSnapshot
      ? {
          timestamp: latestSnapshot.createdAt,
          playlistVersion: latestSnapshot.playlistVersion,
          storageFreeMb: latestSnapshot.storageFreeMb,
          wifiStrength: latestSnapshot.wifiStrength,
          errorCodes: latestSnapshot.errorCodes,
        }
      : null,
    presenceTier: presence?.presenceTier,
    isOnline: presence?.isOnline,
    playbackReported: presence?.playbackReported,
    lastPlaybackReportAt: presence?.lastPlaybackReportAt
      ? new Date(presence.lastPlaybackReportAt).toISOString()
      : null,
    playbackReportIsPlaying: presence?.playbackReportIsPlaying,
    playbackReportState: presence?.playbackReportState,
    staleState: presence?.staleState,
    archiveEligible: presence?.archiveEligible,
  };
}
