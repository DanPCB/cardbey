/**
 * Device cleanup: soft-archive via DeviceCapability JSON (no archivedAt column on Device).
 */

import {
  HEARTBEAT_TIMEOUT_MS,
  ARCHIVE_ELIGIBLE_AFTER_MS,
} from '../constants/devicePresence.js';
import { readDeviceMetadata } from '../lib/deviceProjection.js';

function deviceRecencyMs(device) {
  if (device.lastSeenAt) return new Date(device.lastSeenAt).getTime();
  return device.createdAt ? new Date(device.createdAt).getTime() : 0;
}

function duplicateFingerprint(device) {
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  return [
    'dup',
    norm(device.tenantId),
    norm(device.storeId),
    norm(device.type || 'screen'),
    norm(device.platform || device.appVersion),
    norm(device.model),
  ].join('|');
}

function isSoftArchived(capRow) {
  const meta = readDeviceMetadata(capRow);
  return Boolean(meta.archivedAt);
}

async function softArchiveDevice(prisma, deviceId, reason) {
  const existing = await prisma.deviceCapability.findUnique({
    where: { deviceId },
    select: { capabilities: true },
  });
  const prev =
    existing?.capabilities && typeof existing.capabilities === 'object'
      ? existing.capabilities
      : {};
  const archivedAt = new Date().toISOString();
  await prisma.deviceCapability.upsert({
    where: { deviceId },
    update: {
      capabilities: {
        ...prev,
        archivedAt,
        archiveReason: reason,
      },
    },
    create: {
      deviceId,
      capabilities: { archivedAt, archiveReason: reason },
    },
  });
  await prisma.device.update({
    where: { id: deviceId },
    data: { status: 'offline' },
  });
  console.log('[DEVICE_STALE_ARCHIVE]', { deviceId, reason, archivedAt });
  return deviceId;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ tenantId: string, storeId: string; includeDuplicates?: boolean }} opts
 */
export async function runDeviceCleanupStale(prisma, { tenantId, storeId }) {
  const now = Date.now();
  const heartbeatCutoff = new Date(now - HEARTBEAT_TIMEOUT_MS);
  const archiveEligibleCutoff = new Date(now - ARCHIVE_ELIGIBLE_AFTER_MS);

  const devices = await prisma.device.findMany({
    where: { tenantId, storeId },
    include: {
      capabilities: true,
      bindings: {
        where: { status: { in: ['ready', 'pending', 'PENDING', 'READY'] } },
        orderBy: { lastPushedAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { lastSeenAt: 'desc' },
  });

  const visible = devices.filter((d) => !isSoftArchived(d.capabilities?.[0]));

  const groups = new Map();
  for (const device of visible) {
    const fp = duplicateFingerprint(device);
    if (!groups.has(fp)) groups.set(fp, []);
    groups.get(fp).push(device);
  }

  const duplicatePlans = [];
  for (const [fp, members] of groups.entries()) {
    if (members.length < 2) continue;
    const sorted = [...members].sort((a, b) => deviceRecencyMs(b) - deviceRecencyMs(a));
    const primary = sorted[0];
    const staleDupes = sorted.slice(1);
    duplicatePlans.push({
      fingerprint: fp,
      primaryId: primary.id,
      archiveIds: staleDupes.map((d) => d.id),
    });
  }

  console.log('[DEVICE_STALE_ARCHIVE_START]', {
    tenantId,
    storeId,
    deviceCount: visible.length,
    duplicateGroups: duplicatePlans.length,
  });

  console.log('[DEVICE_DUPLICATE_SCAN]', {
    tenantId,
    storeId,
    deviceCount: visible.length,
    duplicateGroups: duplicatePlans,
  });

  let archivedCount = 0;
  let skippedCount = 0;
  const archivedIds = [];

  for (const plan of duplicatePlans) {
    for (const deviceId of plan.archiveIds) {
      const row = visible.find((d) => d.id === deviceId);
      if (!row) continue;
      const hasBinding = row.bindings?.length > 0;
      const recentHb =
        row.lastSeenAt && row.lastSeenAt >= heartbeatCutoff;
      if (hasBinding && recentHb) {
        skippedCount += 1;
        continue;
      }
      console.log('[DEVICE_STALE_ARCHIVE_ROW]', { deviceId, reason: 'duplicate_stale_row', winnerId: plan.primaryId });
      await softArchiveDevice(prisma, deviceId, 'duplicate_stale_row');
      archivedIds.push(deviceId);
      archivedCount += 1;
      console.log('[DEVICE_DUPLICATE_HIDDEN]', { deviceId, winnerId: plan.primaryId, fingerprint: plan.fingerprint });
    }
  }

  for (const device of visible) {
    if (archivedIds.includes(device.id)) continue;
    if (device.tenantId === 'temp' || device.storeId === 'temp') {
      const stale =
        !device.lastSeenAt || device.lastSeenAt < heartbeatCutoff;
      if (stale) {
        await softArchiveDevice(prisma, device.id, 'temp_unpaired_stale');
        archivedCount += 1;
        continue;
      }
    }

    const lastSeen = device.lastSeenAt;
    const inactive =
      !lastSeen || lastSeen < archiveEligibleCutoff;
    const hasRecentBinding =
      device.bindings?.[0]?.lastPushedAt &&
      device.bindings[0].lastPushedAt >= archiveEligibleCutoff;

    if (inactive && !hasRecentBinding) {
      const recentHb = lastSeen && lastSeen >= heartbeatCutoff;
      if (recentHb) {
        skippedCount += 1;
        continue;
      }
      await softArchiveDevice(prisma, device.id, 'inactive_7d_plus');
      archivedCount += 1;
    }
  }

  console.log('[DEVICE_STALE_ARCHIVE_DONE]', {
    tenantId,
    storeId,
    archivedCount,
    skippedCount,
    archivedIds,
  });

  return { archivedCount, skippedCount, archivedIds, duplicatePlans };
}

export function isDeviceSoftArchived(capabilityRow) {
  return isSoftArchived(capabilityRow);
}
