#!/usr/bin/env node
/**
 * Cleanup stale / ghost device rows on Cardbey Core (staging or local).
 *
 * Uses POST /api/device/debug/cleanup-stale (hard delete) with keepDeviceId
 * set to the most recently seen online device so active signage is preserved.
 *
 * Usage:
 *   node scripts/cleanup-stale-devices.mjs
 *   node scripts/cleanup-stale-devices.mjs --apply
 *
 * Env:
 *   CORE_BASE_URL          default https://cardbey-core-staging.onrender.com
 *   STAGING_ADMIN_TOKEN    default dev-admin-token
 *   KEEP_DEVICE_ID         optional explicit device id to preserve
 *   STALE_OLDER_THAN_MIN   minutes (default 120)
 */

const BASE_URL = (process.env.CORE_BASE_URL || 'https://cardbey-core-staging.onrender.com').replace(/\/$/, '');
const TOKEN = process.env.STAGING_ADMIN_TOKEN || process.env.CORE_ADMIN_TOKEN || 'dev-admin-token';
const OLDER_THAN_MINUTES = Number(process.env.STALE_OLDER_THAN_MIN || 120);
const APPLY = process.argv.includes('--apply') || process.env.CLEANUP_STALE_DEVICES_CONFIRM === 'YES';

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/json',
    ...extra,
  };
}

async function fetchJson(path, init = {}) {
  const res = await fetch(`${BASE_URL}${path}`, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Non-JSON response (${res.status}) from ${path}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${path}: ${body?.message || body?.error || text}`);
  }
  return body;
}

function pickKeepDeviceId(devices, explicit) {
  if (explicit) return explicit;
  const online = devices
    .filter((d) => d.status === 'online' && d.lastSeenAt)
    .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
  if (online.length > 0) return online[0].id;

  const recent = devices
    .filter((d) => d.lastSeenAt)
    .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
  if (recent.length > 0) return recent[0].id;

  throw new Error('No devices found — cannot determine keepDeviceId');
}

function summarizeDevices(devices) {
  const offline = devices.filter((d) => d.status === 'offline');
  const temp = devices.filter((d) => d.tenantId === 'temp' && d.storeId === 'temp');
  const online = devices.filter((d) => d.status === 'online');
  return { total: devices.length, offline: offline.length, temp: temp.length, online: online.length };
}

async function fetchDeviceNetwork() {
  try {
    return await fetchJson('/api/admin/platform/device-network', { headers: authHeaders() });
  } catch {
    return null;
  }
}

async function main() {
  console.log(`[cleanup-stale-devices] target=${BASE_URL} mode=${APPLY ? 'apply' : 'dry-run'}`);

  const inventory = await fetchJson('/api/device/debug/list-all', { headers: authHeaders() });
  const devices = inventory.devices || [];
  const before = summarizeDevices(devices);
  console.log('[cleanup-stale-devices] inventory', before);

  const keepDeviceId = pickKeepDeviceId(devices, process.env.KEEP_DEVICE_ID?.trim());
  const keepRow = devices.find((d) => d.id === keepDeviceId);
  console.log('[cleanup-stale-devices] keepDeviceId', {
    id: keepDeviceId,
    name: keepRow?.name,
    status: keepRow?.status,
    lastSeenAt: keepRow?.lastSeenAt,
    tenantId: keepRow?.tenantId,
    storeId: keepRow?.storeId,
  });

  const payload = {
    keepDeviceId,
    dryRun: !APPLY,
    confirm: APPLY ? 'YES' : undefined,
    olderThanMinutes: OLDER_THAN_MINUTES,
  };

  const result = await fetchJson('/api/device/debug/cleanup-stale', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });

  console.log('[cleanup-stale-devices] cleanup result', {
    dryRun: result.dryRun,
    deleteUniqueCount: result.candidates?.deleteUniqueCount,
    deletedCount: result.deletedCount ?? null,
    tempCount: result.candidates?.tempCount,
    staleOfflineCount: result.candidates?.staleOfflineCount,
    stalePairingCount: result.candidates?.stalePairingCount,
  });

  if (!APPLY) {
    console.log('\nDry-run only. To delete stale devices:');
    console.log('  CLEANUP_STALE_DEVICES_CONFIRM=YES node scripts/cleanup-stale-devices.mjs --apply');
    if (Array.isArray(result.deleteIds) && result.deleteIds.length) {
      console.log(`  would delete ${result.deleteIds.length} device(s)`);
    }
    return;
  }

  const afterInventory = await fetchJson('/api/device/debug/list-all', { headers: authHeaders() });
  const after = summarizeDevices(afterInventory.devices || []);
  const network = await fetchDeviceNetwork();

  console.log('[cleanup-stale-devices] after inventory', after);
  if (network) {
    console.log('[cleanup-stale-devices] device-network', {
      totalDevices: network.totalDevices,
      onlineDevices: network.onlineDevices,
      offlineDevices: network.offlineDevices,
      cnetStatus: network.cnetStatus,
    });
  }

  console.log(`\n✅ Cleanup complete. Removed ${result.deletedCount ?? 0} stale device(s).`);
}

main().catch((err) => {
  console.error('[cleanup-stale-devices] failed:', err.message || err);
  process.exit(1);
});
