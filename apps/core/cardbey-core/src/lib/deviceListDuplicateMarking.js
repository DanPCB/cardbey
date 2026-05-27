/**
 * Mark duplicate Android TV (same fingerprint, different UUID) for list projection.
 * Winners stay visible; losers get presenceTier=duplicate_stale (hidden by default on dashboard).
 */

import { HEARTBEAT_TIMEOUT_MS } from '../constants/devicePresence.js';

function normalizePart(value) {
  return String(value ?? '').trim().toLowerCase();
}

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
    const fp = duplicateDeviceFingerprint(device);
    if (!groups.has(fp)) groups.set(fp, []);
    groups.get(fp).push(device);
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
