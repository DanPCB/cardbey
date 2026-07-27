/**
 * Device Engine V2 — safe unpair (soft disconnect, preserve device row for history).
 * Release marks the physical installation CLAIMABLE and issues a new pairing code
 * without destroying installationId / device record identity.
 */

import crypto from 'crypto';
import { broadcastSse } from '../realtime/simpleSse.js';
import { upsertDeviceMetadata, readDeviceMetadata } from '../lib/deviceProjection.js';
import { enqueueDeviceCommand } from '../engines/device/commands.js';
import { addDeviceLog } from '../engines/device/logs.js';
import { logDeviceIdentityEvent } from '../lib/deviceIdentity.js';
import { PAIRING_TTL_MS } from '../engines/device/pairingSessionTiming.js';

const ACTIVE_BINDING_STATUSES = ['ready', 'pending', 'active', 'assigned'];

function generatePairingCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase().substring(0, 6);
}

/**
 * @param {{ role?: string | null }} user
 */
export function isDeviceAdmin(user) {
  const role = String(user?.role ?? '').toLowerCase();
  return role === 'admin' || role === 'super_admin';
}

/**
 * @param {{ tenantId?: string | null, storeId?: string | null }} device
 * @param {{ tenantId?: string, storeId?: string, userId?: string, user?: { role?: string } }} auth
 */
export function verifyUnpairAuth(device, auth) {
  if (!device) {
    return { ok: false, status: 404, error: 'Device not found' };
  }

  const requestTenantId = String(auth.tenantId ?? auth.userId ?? '').trim();
  const requestStoreId = String(auth.storeId ?? '').trim();
  const admin = isDeviceAdmin(auth.user);

  if (!admin) {
    if (!requestTenantId) {
      return { ok: false, status: 401, error: 'Unable to determine tenantId' };
    }
    if (device.tenantId !== requestTenantId) {
      return { ok: false, status: 403, error: 'Device does not belong to your tenant' };
    }
    if (requestStoreId && device.storeId !== requestStoreId) {
      return { ok: false, status: 403, error: 'Access denied' };
    }
  } else if (requestTenantId && requestStoreId) {
    if (device.tenantId !== requestTenantId || device.storeId !== requestStoreId) {
      return { ok: false, status: 403, error: 'Access denied' };
    }
  }

  return { ok: true, admin };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} options
 */
export async function unpairDevice(prisma, options) {
  const {
    deviceId,
    tenantId,
    storeId,
    userId,
    user,
    reason = 'manual_unpair',
    archive = false,
    clearBindings = true,
    resetToTemp = true,
  } = options;

  console.log('[DEVICE_UNPAIR_START]', { deviceId, tenantId, storeId, reason, archive, resetToTemp });

  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: {
      capabilities: { take: 1 },
      bindings: true,
    },
  });

  const auth = verifyUnpairAuth(device, { tenantId, storeId, userId, user });
  if (!auth.ok) {
    console.warn('[DEVICE_UNPAIR_FAILED]', { deviceId, status: auth.status, error: auth.error });
    const err = new Error(auth.error);
    err.status = auth.status;
    throw err;
  }

  console.log('[DEVICE_UNPAIR_AUTH]', { deviceId, admin: auth.admin });

  let bindingsCleared = 0;
  let commandId = null;
  const previousAccountId = device.tenantId;
  const previousStoreId = device.storeId;
  const releasedAt = new Date().toISOString();
  const releasedBy = String(userId || tenantId || '').trim() || null;

  // Issue a fresh pairing code so the physical installation becomes CLAIMABLE
  // without creating a new device record.
  let claimPairingCode = null;
  if (resetToTemp && !archive) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const candidate = generatePairingCode();
      const clash = await prisma.device.findUnique({ where: { pairingCode: candidate } });
      if (!clash) {
        claimPairingCode = candidate;
        break;
      }
    }
    if (!claimPairingCode) {
      const err = new Error('Failed to generate claimable pairing code');
      err.status = 500;
      throw err;
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    if (clearBindings) {
      const bindingUpdate = await tx.devicePlaylistBinding.updateMany({
        where: {
          deviceId,
          status: { in: ACTIVE_BINDING_STATUSES },
        },
        data: {
          status: 'unpaired',
        },
      });
      bindingsCleared = bindingUpdate.count;
      console.log('[DEVICE_UNPAIR_BINDINGS_CLEARED]', { deviceId, count: bindingsCleared });
    }

    const deviceUpdate = {
      pairingCode: claimPairingCode,
      playbackReportIsPlaying: null,
      playbackReportState: null,
      status: 'offline',
    };

    if (resetToTemp) {
      deviceUpdate.tenantId = 'temp';
      deviceUpdate.storeId = 'temp';
    }

    const updatedDevice = await tx.device.update({
      where: { id: deviceId },
      data: deviceUpdate,
    });

    const pairingStatus = archive ? 'UNPAIRED' : resetToTemp ? 'CLAIMABLE' : 'UNPAIRED';
    const pairingCodeIssuedAt = claimPairingCode ? releasedAt : undefined;

    const metadataPatch = {
      pairingStatus,
      currentPlaylistId: null,
      unpairedAt: releasedAt,
      unpairReason: reason,
      releasedBy,
      releasedAt,
      previousAccountId,
      previousStoreId,
      ...(pairingCodeIssuedAt ? { pairingCodeIssuedAt } : {}),
    };

    if (archive) {
      const cap = device.capabilities?.[0];
      const prev =
        cap?.capabilities && typeof cap.capabilities === 'object' ? cap.capabilities : {};
      metadataPatch.archivedAt = new Date().toISOString();
      metadataPatch.archiveReason = reason || 'manual_unpair';
      metadataPatch.pairingStatus = 'UNPAIRED';
      await tx.deviceCapability.upsert({
        where: { deviceId },
        update: {
          capabilities: { ...prev, ...metadataPatch },
        },
        create: {
          deviceId,
          capabilities: metadataPatch,
        },
      });
    } else {
      await upsertDeviceMetadata(tx, deviceId, metadataPatch);
    }

    await tx.devicePairing.updateMany({
      where: {
        deviceId,
        status: 'pending',
      },
      data: {
        status: 'expired',
      },
    });

    console.log('[DEVICE_UNPAIR_DB_WRITE]', {
      deviceId,
      tenantId: updatedDevice.tenantId,
      storeId: updatedDevice.storeId,
      pairingStatus,
      claimable: Boolean(claimPairingCode),
    });

    return updatedDevice;
  });

  logDeviceIdentityEvent('DEVICE_RELEASED', {
    deviceId,
    accountId: previousAccountId,
    storeId: previousStoreId,
    pairingStatus: archive ? 'UNPAIRED' : 'CLAIMABLE',
    reason,
  });

  try {
    const cmd = await enqueueDeviceCommand(deviceId, 'returnHome', {
      reason: 'device_unpaired',
      clearPlaylist: true,
      unpairReason: reason,
    });
    commandId = cmd.id;
    console.log('[DEVICE_UNPAIR_COMMAND_QUEUED]', { deviceId, commandId, type: 'returnHome' });
  } catch (cmdErr) {
    console.warn('[DEVICE_UNPAIR_COMMAND_QUEUED]', {
      deviceId,
      error: cmdErr.message,
      note: 'command queue failed (non-fatal)',
    });
  }

  const capRow = await prisma.deviceCapability.findUnique({
    where: { deviceId },
    select: { capabilities: true },
  });
  const metadata = readDeviceMetadata(capRow);

  const finalPairingStatus = metadata.pairingStatus || (claimPairingCode ? 'CLAIMABLE' : 'UNPAIRED');
  const expiresAt = claimPairingCode
    ? new Date(Date.now() + PAIRING_TTL_MS).toISOString()
    : null;

  const ssePayload = {
    deviceId: result.id,
    pairingStatus: finalPairingStatus,
    tenantId: result.tenantId,
    storeId: result.storeId,
    playlistId: null,
    currentPlaylistId: null,
    status: result.status,
    lastSeenAt: result.lastSeenAt?.toISOString?.() ?? null,
    reason,
    archived: archive,
    // pairing code intentionally omitted from SSE (claim via dashboard / TV overlay)
    at: new Date().toISOString(),
  };

  broadcastSse('admin', 'device.status.changed', ssePayload);
  broadcastSse('admin', 'device:update', ssePayload);
  broadcastSse('admin', 'device:unpaired', ssePayload);

  await addDeviceLog({
    deviceId,
    source: 'pairing',
    level: 'info',
    message: 'Device released / unpaired',
    payload: {
      reason,
      resetToTemp,
      archive,
      bindingsCleared,
      commandId,
      releasedBy,
      releasedAt,
      previousAccountId,
      previousStoreId,
      pairingStatus: finalPairingStatus,
      // never log pairing code
    },
  });

  console.log('[DEVICE_UNPAIR_COMPLETE]', {
    deviceId,
    bindingsCleared,
    commandId,
    tenantId: result.tenantId,
    storeId: result.storeId,
    pairingStatus: finalPairingStatus,
  });

  return {
    ok: true,
    deviceId: result.id,
    pairingStatus: finalPairingStatus,
    pairingCode: claimPairingCode,
    expiresAt,
    tenantId: result.tenantId,
    storeId: result.storeId,
    playlistId: null,
    bindingsCleared,
    commandId,
    archived: archive,
    resetToTemp,
    releasedBy,
    releasedAt,
    previousAccountId,
    previousStoreId,
  };
}
