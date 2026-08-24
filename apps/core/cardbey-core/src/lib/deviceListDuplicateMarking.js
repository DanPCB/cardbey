/**
 * Mark true physical duplicates for list projection.
 * Only rows that share a non-empty installationId are demoted (same install, multiple UUIDs).
 * Weak tenant+store+platform+model fingerprints must NOT demote — multi-screen stores
 * often have several identical TVs and must all stay visible/online.
 */

import { HEARTBEAT_TIMEOUT_MS } from '../constants/devicePresence.js';

function normalizePart(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * @deprecated Prefer installationId grouping. Kept for diagnostics / callers that log fingerprints.
 */
export function duplicateDeviceFingerprint(device) {
  return [
    'dup',
    normalizePart(device.tenantId),
    normalizePart(device.storeId),
    normalizePart(device.type || 'screen'),
    normalizePart(device.platform || device.appVersion),
    normalizePart(device.model),
  ].join('|');
}

export function resolveInstallationId(device) {
  const direct = String(device?.installationId || '').trim();
  if (direct) return direct;
  const caps = device?.capabilities;
  if (caps && typeof caps === 'object' && !Array.isArray(caps)) {
    const fromCaps = String(caps.installationId || '').trim();
    if (fromCaps) return fromCaps;
  }
  return '';
}

function recencyMs(device) {
  if (device.lastSeenAt) return new Date(device.lastSeenAt).getTime();
  return device.createdAt ? new Date(device.createdAt).getTime() : 0;
}

function scoreWinner(device, nowMs) {
  const lastSeen = recencyMs(device);
  const hbFresh =
    device.lastSeenAt &&
    nowMs - new Date(device.lastSeenAt).getTime() < HEARTBEAT_TIMEOUT_MS;
  const hasPlaylist = Boolean(device.playlistId || device.playlist?.playlistId);
  const online = device.isOnline === true || device.status === 'online';
  return (
    (hbFresh ? 1_000_000 : 0) +
    (online ? 100_000 : 0) +
    (hasPlaylist ? 10_000 : 0) +
    lastSeen
  );
}

/**
 * @param {Array<Record<string, unknown>>} devices formatted list rows
 * @param {Date} [now]
 * @returns {Array<Record<string, unknown>>}
 */
export function markDuplicateDevicesInList(devices, now = new Date()) {
  const nowMs = now.getTime();
  const groups = new Map();

  for (const device of devices) {
    if (!device?.id) continue;
    if (device.tenantId === 'temp' || device.storeId === 'temp') continue;
    const installId = resolveInstallationId(device);
    // Distinct physical screens (no shared install id) must not be collapsed.
    if (!installId) continue;
    const key = `install|${normalizePart(installId)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(device);
  }

  const duplicatePlans = [];
  for (const [fingerprint, members] of groups.entries()) {
    if (members.length < 2) continue;
    const sorted = [...members].sort((a, b) => scoreWinner(b, nowMs) - scoreWinner(a, nowMs));
    const winner = sorted[0];
    const losers = sorted.slice(1);
    duplicatePlans.push({ fingerprint, winnerId: winner.id, loserIds: losers.map((d) => d.id) });

    console.log('[DEVICE_DUPLICATE_GROUP]', {
      fingerprint,
      count: members.length,
      winnerId: winner.id,
      loserIds: losers.map((d) => d.id),
      reason: 'shared_installationId',
    });

    for (const loser of losers) {
      loser.presenceTier = 'duplicate_stale';
      loser.duplicateStale = true;
      loser.isOnline = false;
      loser.status = 'offline';
      console.log('[DEVICE_DUPLICATE_HIDDEN]', {
        deviceId: loser.id,
        winnerId: winner.id,
        fingerprint,
        reason: 'shared_installationId',
      });
    }

    console.log('[DEVICE_DUPLICATE_WINNER]', {
      deviceId: winner.id,
      fingerprint,
      lastSeenAt: winner.lastSeenAt,
      hasPlaylist: Boolean(winner.playlistId || winner.playlist?.playlistId),
    });
  }

  if (duplicatePlans.length > 0) {
    console.log('[DEVICE_DUPLICATE_SCAN]', {
      deviceCount: devices.length,
      duplicateGroups: duplicatePlans.length,
      plans: duplicatePlans,
    });
  }

  return devices;
}
