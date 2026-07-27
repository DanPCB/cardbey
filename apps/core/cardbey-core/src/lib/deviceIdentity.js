/**
 * Device V2 physical identity helpers.
 * Separates stable installation identity from mutable ownership (tenant/store).
 */

import crypto from 'crypto';

const REJECTED_INSTALLATION_SENTINELS = new Set([
  '',
  'unknown',
  'null',
  'undefined',
  'none',
  'n/a',
  'na',
]);

/**
 * Normalize installation identity for persistence.
 * Returns NULL (not empty string) when missing or invalid.
 * Never invents a new id — TV-supplied stable ids only.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeInstallationId(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (REJECTED_INSTALLATION_SENTINELS.has(normalized.toLowerCase())) return null;
  return normalized;
}

/**
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function hashInstallationId(value) {
  const normalized = normalizeInstallationId(value);
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Structured diagnostic log (never log raw pairing tokens / auth).
 * @param {string} event
 * @param {Record<string, unknown>} fields
 */
export function logDeviceIdentityEvent(event, fields = {}) {
  const safe = {
    event,
    deviceId: fields.deviceId ?? null,
    installationIdHash: fields.installationIdHash
      ?? hashInstallationId(fields.installationId)
      ?? null,
    accountId: fields.accountId ?? fields.tenantId ?? null,
    storeId: fields.storeId ?? null,
    playlistId: fields.playlistId ?? null,
    pairingStatus: fields.pairingStatus ?? null,
    canonicalDeviceId: fields.canonicalDeviceId ?? null,
    reason: fields.reason ?? null,
  };
  console.log(`[${event}]`, safe);
}

/**
 * Find device by installationId column, then capabilities JSON fallback.
 * @param {import('@prisma/client').PrismaClient} db
 * @param {string} installationId
 */
export async function findDeviceByInstallationId(db, installationId) {
  const id = normalizeInstallationId(installationId);
  if (!id) return null;

  try {
    if (typeof db.device.findFirst === 'function') {
      const byColumn = await db.device.findFirst({
        where: { installationId: id },
      });
      if (byColumn) return byColumn;
    }
  } catch (err) {
    // Column may not exist until prisma db push — fall through to capabilities.
    if (err?.code !== 'P2022' && !String(err?.message || '').includes('installationId')) {
      console.warn('[DEVICE_IDENTITY] findByInstallationId column lookup failed', {
        message: err?.message,
      });
    }
  }

  const caps = await db.deviceCapability.findMany({
    take: 200,
    orderBy: { updatedAt: 'desc' },
    select: { deviceId: true, capabilities: true },
  });
  const match = caps.find((row) => {
    const c = row.capabilities;
    return c && typeof c === 'object' && String(c.installationId || '').trim() === id;
  });
  if (!match) return null;
  return db.device.findUnique({ where: { id: match.deviceId } });
}

/**
 * Persist installationId on Device (best-effort) and DeviceCapability JSON.
 * @param {import('@prisma/client').PrismaClient} db
 * @param {string} deviceId
 * @param {string} installationId
 * @param {Record<string, unknown>} [extraCaps]
 */
export async function persistInstallationId(db, deviceId, installationId, extraCaps = {}) {
  const id = normalizeInstallationId(installationId);
  if (!deviceId) return;
  // Explicit NULL when blank/invalid — never persist "", "unknown", etc.
  const columnValue = id;

  try {
    await db.device.update({
      where: { id: deviceId },
      data: { installationId: columnValue },
    });
  } catch (err) {
    // Schema not migrated yet — capabilities still hold the identity when non-null.
    console.warn('[DEVICE_IDENTITY] installationId column write skipped', {
      deviceId,
      message: err?.message,
    });
  }

  if (!id) return;

  const existing = await db.deviceCapability.findUnique({
    where: { deviceId },
    select: { capabilities: true },
  });
  const prior =
    existing?.capabilities && typeof existing.capabilities === 'object'
      ? existing.capabilities
      : {};

  await db.deviceCapability.upsert({
    where: { deviceId },
    update: {
      capabilities: {
        ...prior,
        ...extraCaps,
        installationId: id,
      },
    },
    create: {
      deviceId,
      capabilities: {
        ...extraCaps,
        installationId: id,
      },
    },
  });
}

/**
 * Resolve canonical device for heartbeat/pairing.
 * Priority: installationId match → deviceId match → null
 *
 * @param {import('@prisma/client').PrismaClient} db
 * @param {{ deviceId?: string, installationId?: string }} ids
 */
export async function resolveCanonicalDevice(db, { deviceId, installationId }) {
  const installId = normalizeInstallationId(installationId);
  const rowId = String(deviceId || '').trim();

  if (installId) {
    const byInstall = await findDeviceByInstallationId(db, installId);
    if (byInstall) {
      return {
        device: byInstall,
        matchReason: 'installationId',
        requestedDeviceId: rowId || null,
      };
    }
  }

  if (rowId) {
    const byId = await db.device.findUnique({ where: { id: rowId } });
    if (byId) {
      return {
        device: byId,
        matchReason: 'deviceId',
        requestedDeviceId: rowId,
      };
    }
  }

  return { device: null, matchReason: null, requestedDeviceId: rowId || null };
}

/**
 * Read archivedAt from capabilities.
 * @param {object | null | undefined} deviceCapRow
 */
export function isDeviceArchived(capabilities) {
  if (!capabilities || typeof capabilities !== 'object') return false;
  return Boolean(capabilities.archivedAt);
}

/**
 * Build a safe duplicate detection report entry.
 */
export function buildDuplicateReportEntry({
  canonicalDeviceId,
  duplicateDeviceIds,
  ownership,
  storeAssignment,
  lastSeenAt,
  playlistAssignment,
  reason,
  safeMergeEligible,
  installationIdHash = null,
}) {
  return {
    canonicalDeviceId,
    duplicateDeviceIds,
    ownership,
    storeAssignment,
    lastSeenAt,
    playlistAssignment,
    reason,
    installationIdHash,
    safeMergeEligible: Boolean(safeMergeEligible),
  };
}
