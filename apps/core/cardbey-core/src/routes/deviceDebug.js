/**
 * Device Debug Routes
 * Dev-only routes for debugging device issues
 * ⚠️ NOT FOR PRODUCTION - Only available when NODE_ENV !== 'production'
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

function isNonProd() {
  return process.env.NODE_ENV !== 'production';
}

function isTruthyYes(value) {
  return String(value || '').trim().toUpperCase() === 'YES';
}

function toIso(d) {
  try {
    return d ? new Date(d).toISOString() : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/device/debug/list-all
 * List ALL devices in the database without any filtering
 * ⚠️ DEV ONLY - Not available in production
 */
router.get('/list-all', async (req, res) => {
  // Only allow in non-production environments
  if (!isNonProd()) {
    return res.status(403).json({
      ok: false,
      error: 'forbidden',
      message: 'Debug routes are not available in production',
    });
  }

  try {
    console.log('[Device Debug] GET /api/device/debug/list-all');

    // Query ALL devices without filtering
    const devices = await prisma.device.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tenantId: true,
        storeId: true,
        pairingCode: true,
        status: true,
        lastSeenAt: true,
        name: true,
        type: true,
        platform: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    console.log('[Device Debug] Devices in DB:', devices.length);

    // Check for orphan devices (missing tenant/store or mismatched)
    const orphanDevices = devices.filter((device) => {
      return !device.tenantId || 
             !device.storeId || 
             device.tenantId === 'temp' || 
             device.storeId === 'temp';
    });

    if (orphanDevices.length > 0) {
      console.warn('[Device Debug] Orphan devices (missing tenant/store):', orphanDevices.map(d => ({
        id: d.id,
        tenantId: d.tenantId,
        storeId: d.storeId,
        name: d.name,
        status: d.status,
      })));
    }

    // Group devices by tenant/store for analysis
    const byTenantStore = {};
    devices.forEach((device) => {
      const key = `${device.tenantId || 'null'}:${device.storeId || 'null'}`;
      if (!byTenantStore[key]) {
        byTenantStore[key] = [];
      }
      byTenantStore[key].push(device);
    });

    console.log('[Device Debug] Devices grouped by tenant:store:', Object.keys(byTenantStore).map(key => ({
      key,
      count: byTenantStore[key].length,
    })));

    res.json({
      ok: true,
      count: devices.length,
      devices,
      orphanCount: orphanDevices.length,
      orphanDevices: orphanDevices.map(d => ({
        id: d.id,
        tenantId: d.tenantId,
        storeId: d.storeId,
        name: d.name,
        status: d.status,
      })),
      groupedByTenantStore: Object.entries(byTenantStore).map(([key, devices]) => ({
        key,
        count: devices.length,
        tenantId: devices[0].tenantId,
        storeId: devices[0].storeId,
      })),
    });
  } catch (error) {
    console.error('[Device Debug] List all error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to list all devices',
    });
  }
});

/**
 * POST /api/device/debug/cleanup-stale
 * DEV-ONLY cleanup: remove stale device rows while preserving a keepDeviceId.
 *
 * Body:
 *  {
 *    keepDeviceId: string,          // REQUIRED: device row to preserve
 *    dryRun?: boolean,              // default true
 *    confirm?: "YES",               // REQUIRED when dryRun=false
 *    olderThanMinutes?: number,     // default 120 (2h) for stale offline/pairing rows
 *    scopeTenantId?: string,        // optional: only delete within tenantId
 *    scopeStoreId?: string          // optional: only delete within storeId
 *  }
 *
 * Deletes ONLY:
 * - temp/temp rows (excluding keepDeviceId)
 * - offline rows with lastSeenAt older than threshold (excluding keepDeviceId)
 * - pairingCode rows older than threshold (excluding keepDeviceId)
 *
 * Never deletes:
 * - keepDeviceId
 * - any non-offline device (online/degraded) unless it is temp/temp (still excluded if keepDeviceId)
 */
router.post('/cleanup-stale', async (req, res) => {
  if (!isNonProd()) {
    return res.status(403).json({
      ok: false,
      error: 'forbidden',
      message: 'Debug routes are not available in production',
    });
  }

  const body = req.body || {};
  const keepDeviceId = typeof body.keepDeviceId === 'string' ? body.keepDeviceId.trim() : '';
  const dryRun = body.dryRun !== false; // default true
  const confirm = body.confirm;
  const olderThanMinutesRaw = Number(body.olderThanMinutes);
  const olderThanMinutes = Number.isFinite(olderThanMinutesRaw) && olderThanMinutesRaw > 0 ? olderThanMinutesRaw : 120;
  const scopeTenantId = typeof body.scopeTenantId === 'string' ? body.scopeTenantId.trim() : '';
  const scopeStoreId = typeof body.scopeStoreId === 'string' ? body.scopeStoreId.trim() : '';

  if (!keepDeviceId) {
    return res.status(400).json({ ok: false, error: 'missing_keepDeviceId' });
  }
  if (!dryRun && !isTruthyYes(confirm)) {
    return res.status(400).json({
      ok: false,
      error: 'confirm_required',
      message: 'Set confirm="YES" to delete devices (or use dryRun=true).',
    });
  }

  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  const scopeWhere = {
    ...(scopeTenantId ? { tenantId: scopeTenantId } : {}),
    ...(scopeStoreId ? { storeId: scopeStoreId } : {}),
  };

  // Audit: compute "live device" candidate for visibility (newest heartbeat)
  const liveCandidate = await prisma.device.findFirst({
    where: {
      ...scopeWhere,
      tenantId: { not: 'temp' },
      storeId: { not: 'temp' },
      lastSeenAt: { not: null },
    },
    orderBy: { lastSeenAt: 'desc' },
    select: { id: true, tenantId: true, storeId: true, status: true, lastSeenAt: true, pairingCode: true },
  });

  // Candidates
  const tempCandidates = await prisma.device.findMany({
    where: {
      ...scopeWhere,
      id: { not: keepDeviceId },
      tenantId: 'temp',
      storeId: 'temp',
    },
    select: { id: true, status: true, lastSeenAt: true, pairingCode: true, createdAt: true },
  });

  const staleOfflineCandidates = await prisma.device.findMany({
    where: {
      ...scopeWhere,
      id: { not: keepDeviceId },
      status: 'offline',
      OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }],
    },
    select: { id: true, tenantId: true, storeId: true, lastSeenAt: true, pairingCode: true, createdAt: true },
  });

  const stalePairingCandidates = await prisma.device.findMany({
    where: {
      ...scopeWhere,
      id: { not: keepDeviceId },
      pairingCode: { not: null },
      createdAt: { lt: cutoff },
    },
    select: { id: true, tenantId: true, storeId: true, status: true, lastSeenAt: true, pairingCode: true, createdAt: true },
  });

  // Deduplicate by id
  const byId = new Map();
  for (const d of [...tempCandidates, ...staleOfflineCandidates, ...stalePairingCandidates]) {
    byId.set(d.id, d);
  }
  const deleteIds = Array.from(byId.keys()).filter((id) => id !== keepDeviceId);

  const summary = {
    keepDeviceId,
    dryRun,
    cutoff: cutoff.toISOString(),
    scope: { tenantId: scopeTenantId || null, storeId: scopeStoreId || null },
    liveCandidate: liveCandidate
      ? { ...liveCandidate, lastSeenAt: toIso(liveCandidate.lastSeenAt) }
      : null,
    candidates: {
      tempCount: tempCandidates.length,
      staleOfflineCount: staleOfflineCandidates.length,
      stalePairingCount: stalePairingCandidates.length,
      deleteUniqueCount: deleteIds.length,
    },
  };

  if (dryRun) {
    console.log('[CLEANUP DEVICES] dry-run', summary);
    return res.json({ ok: true, ...summary, deleteIds: deleteIds.slice(0, 200) });
  }

  // Execute deletes
  const deleted = await prisma.device.deleteMany({
    where: {
      id: { in: deleteIds },
    },
  });

  console.log('[CLEANUP DEVICES]', {
    keepDeviceId,
    deletedCount: deleted.count,
    deletedTempCount: tempCandidates.length,
    deletedOfflineCount: staleOfflineCandidates.length,
    deletedPairingCount: stalePairingCandidates.length,
  });

  return res.json({
    ok: true,
    ...summary,
    deletedCount: deleted.count,
  });
});

export default router;



