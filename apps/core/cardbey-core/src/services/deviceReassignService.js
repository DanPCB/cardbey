/**
 * Same-account store reassignment for Device V2.
 * Updates assignedStoreId on the existing device record — never creates a new row.
 */

import { broadcastSse } from '../realtime/simpleSse.js';
import { upsertDeviceMetadata, readDeviceMetadata } from '../lib/deviceProjection.js';
import { addDeviceLog } from '../engines/device/logs.js';
import { logDeviceIdentityEvent } from '../lib/deviceIdentity.js';
import { isDeviceAdmin, verifyUnpairAuth } from './deviceUnpairService.js';

const ACTIVE_BINDING_STATUSES = ['ready', 'pending', 'active', 'assigned'];

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} options
 */
export async function reassignDeviceStore(prisma, options) {
  const {
    deviceId,
    tenantId,
    storeId: currentStoreId,
    newStoreId,
    playlistId = null,
    userId,
    user,
  } = options;

  const targetStoreId = String(newStoreId || '').trim();
  if (!deviceId || !targetStoreId) {
    const err = new Error('deviceId and newStoreId are required');
    err.status = 400;
    throw err;
  }

  logDeviceIdentityEvent('DEVICE_REASSIGN_REQUESTED', {
    deviceId,
    tenantId,
    storeId: currentStoreId,
    reason: `newStoreId=${targetStoreId}`,
  });

  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: {
      capabilities: { take: 1 },
      bindings: true,
    },
  });

  if (!device) {
    const err = new Error('Device not found');
    err.status = 404;
    throw err;
  }

  const auth = verifyUnpairAuth(device, {
    tenantId,
    storeId: currentStoreId,
    userId,
    user,
  });
  if (!auth.ok) {
    const err = new Error(auth.error);
    err.status = auth.status;
    throw err;
  }

  if (device.tenantId === 'temp' || device.storeId === 'temp') {
    const err = new Error('Device is not paired; claim it first');
    err.status = 409;
    throw err;
  }

  if (device.tenantId !== String(tenantId || userId || '').trim() && !isDeviceAdmin(user)) {
    const err = new Error('Device does not belong to your account');
    err.status = 403;
    throw err;
  }

  // Validate target store belongs to the same owning account (Business.userId === tenantId).
  const business = await prisma.business.findUnique({
    where: { id: targetStoreId },
    select: { id: true, userId: true, name: true },
  });
  if (!business) {
    const err = new Error('Target store not found');
    err.status = 404;
    throw err;
  }
  const ownerAccountId = String(device.tenantId).trim();
  if (String(business.userId || '').trim() !== ownerAccountId && !isDeviceAdmin(user)) {
    const err = new Error('Target store does not belong to the device owning account');
    err.status = 403;
    throw err;
  }

  if (device.storeId === targetStoreId && !playlistId) {
    return {
      ok: true,
      deviceId: device.id,
      storeId: device.storeId,
      tenantId: device.tenantId,
      unchanged: true,
    };
  }

  const previousStoreId = device.storeId;
  let bindingsCleared = 0;
  let assignedPlaylistId = null;

  const updated = await prisma.$transaction(async (tx) => {
    const cleared = await tx.devicePlaylistBinding.updateMany({
      where: {
        deviceId,
        status: { in: ACTIVE_BINDING_STATUSES },
      },
      data: { status: 'unassigned' },
    });
    bindingsCleared = cleared.count;

    const next = await tx.device.update({
      where: { id: deviceId },
      data: {
        storeId: targetStoreId,
        pairingCode: null,
      },
    });

    if (playlistId) {
      const pl = String(playlistId).trim();
      await tx.devicePlaylistBinding.upsert({
        where: {
          deviceId_playlistId: { deviceId, playlistId: pl },
        },
        update: {
          status: 'pending',
          version: String(Date.now()),
          lastPushedAt: new Date(),
        },
        create: {
          deviceId,
          playlistId: pl,
          version: String(Date.now()),
          status: 'pending',
        },
      });
      assignedPlaylistId = pl;
    }

    await upsertDeviceMetadata(tx, deviceId, {
      pairingStatus: assignedPlaylistId ? 'PAIRED_PLAYLIST_ASSIGNED' : 'PAIRED_NO_PLAYLIST',
      currentPlaylistId: assignedPlaylistId,
      reassignedAt: new Date().toISOString(),
      previousStoreId,
      assignedStoreId: targetStoreId,
    });

    return next;
  });

  const capRow = await prisma.deviceCapability.findUnique({
    where: { deviceId },
    select: { capabilities: true },
  });
  const metadata = readDeviceMetadata(capRow);

  const ssePayload = {
    deviceId: updated.id,
    tenantId: updated.tenantId,
    storeId: updated.storeId,
    previousStoreId,
    playlistId: assignedPlaylistId,
    pairingStatus: metadata.pairingStatus || 'PAIRED_NO_PLAYLIST',
    at: new Date().toISOString(),
  };

  broadcastSse('admin', 'device.status.changed', ssePayload);
  broadcastSse('admin', 'device:update', ssePayload);
  broadcastSse('admin', 'device:reassigned', ssePayload);

  await addDeviceLog({
    deviceId,
    source: 'pairing',
    level: 'info',
    message: 'Device reassigned to another store',
    payload: {
      previousStoreId,
      newStoreId: targetStoreId,
      bindingsCleared,
      playlistId: assignedPlaylistId,
      // Do not expose private account PII
      accountId: ownerAccountId,
    },
  });

  logDeviceIdentityEvent('DEVICE_REASSIGNED', {
    deviceId,
    accountId: ownerAccountId,
    storeId: targetStoreId,
    playlistId: assignedPlaylistId,
    pairingStatus: metadata.pairingStatus,
    reason: `fromStore=${previousStoreId}`,
  });

  logDeviceIdentityEvent('PLAYLIST_ASSIGNMENT_UPDATED', {
    deviceId,
    storeId: targetStoreId,
    playlistId: assignedPlaylistId,
    reason: playlistId ? 'reassign_with_playlist' : 'reassign_clear_playlist',
  });

  return {
    ok: true,
    deviceId: updated.id,
    tenantId: updated.tenantId,
    storeId: updated.storeId,
    previousStoreId,
    playlistId: assignedPlaylistId,
    bindingsCleared,
    pairingStatus: metadata.pairingStatus || 'PAIRED_NO_PLAYLIST',
  };
}
