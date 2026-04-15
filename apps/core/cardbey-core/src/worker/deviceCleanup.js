// deviceCleanup.js - Worker for cleaning up stale devices
import { prisma } from '../lib/prisma.js';

const PRISMA_TABLE_MISSING = 'P2021';

async function runDeviceCleanup() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await prisma.device.updateMany({
      where: { lastSeenAt: { lt: thirtyDaysAgo }, status: 'offline' },
      data: { status: 'offline' }
    });
    console.log('[DeviceCleanup] Complete:', result.count, 'devices checked');
  } catch (e) {
    if (e?.code === PRISMA_TABLE_MISSING || String(e?.message || '').includes('does not exist')) {
      // Schema not applied yet (common on fresh staging DBs) — skip silently to avoid crash loops.
      return;
    }
    console.warn('[DeviceCleanup] Error (non-fatal):', e?.message || e);
  }
}

export function startDeviceCleanupWorker(intervalMs = 10 * 60 * 1000) {
  console.log('[DEVICE_CLEANUP] starting worker (interval 10 min)');
  runDeviceCleanup();
  setInterval(runDeviceCleanup, intervalMs);
}

export { runDeviceCleanup };
