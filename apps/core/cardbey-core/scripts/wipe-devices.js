/**
 * DEV-ONLY: Wipe all device-related data.
 *
 * This is destructive. It will delete ALL Device rows (and cascading children),
 * plus pending DevicePairing rows. It also nulls PlaylistSchedule.deviceId to
 * avoid stale schedule pointers (no FK in schema, but keeps data consistent).
 *
 * Usage:
 *   I_UNDERSTAND=YES node scripts/wipe-devices.js
 *
 * Optional:
 *   WIPE_TENANT_ID=<tenantId> WIPE_STORE_ID=<storeId> I_UNDERSTAND=YES node scripts/wipe-devices.js
 */

import { getPrismaClient } from '../src/db/prisma.js';

const prisma = getPrismaClient();

function requireConfirmation() {
  const ok = String(process.env.I_UNDERSTAND || '').trim().toUpperCase() === 'YES';
  if (!ok) {
    throw new Error('Refusing to wipe devices. Set I_UNDERSTAND=YES to proceed.');
  }
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('Refusing to wipe devices in production.');
  }
}

function whereClause() {
  const tenantId = String(process.env.WIPE_TENANT_ID || '').trim();
  const storeId = String(process.env.WIPE_STORE_ID || '').trim();
  const where = {};
  if (tenantId) where.tenantId = tenantId;
  if (storeId) where.storeId = storeId;
  return { where, tenantId: tenantId || null, storeId: storeId || null };
}

async function main() {
  requireConfirmation();

  const { where, tenantId, storeId } = whereClause();
  console.log('[wipe-devices] starting', { tenantId, storeId });

  const deviceCount = await prisma.device.count({ where });
  const pairingCount = await prisma.devicePairing.count({
    where: {
      ...(tenantId ? { tenantId } : {}),
      ...(storeId ? { storeId } : {}),
    },
  });

  console.log('[wipe-devices] counts before', { deviceCount, pairingCount });

  // Best-effort: remove device pointers from schedules (no FK, but avoids confusion)
  const scheduleUpdate = await prisma.playlistSchedule.updateMany({
    where: {
      deviceId: { not: null },
      ...(tenantId ? { tenantId } : {}),
      ...(storeId ? { storeId } : {}),
    },
    data: { deviceId: null },
  });

  // Delete pairing codes (dashboard-initiated flow)
  const pairingDelete = await prisma.devicePairing.deleteMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      ...(storeId ? { storeId } : {}),
    },
  });

  // Delete devices (cascades to capabilities/snapshots/bindings/commands/logs/alerts)
  const deviceDelete = await prisma.device.deleteMany({ where });

  console.log('[wipe-devices] results', {
    playlistScheduleCleared: scheduleUpdate.count,
    devicePairingsDeleted: pairingDelete.count,
    devicesDeleted: deviceDelete.count,
  });

  const deviceCountAfter = await prisma.device.count({ where });
  console.log('[wipe-devices] counts after', { deviceCountAfter });
}

main()
  .catch((err) => {
    console.error('[wipe-devices] failed', { message: err?.message });
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {
      // ignore
    }
  });

