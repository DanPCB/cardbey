/**
 * Device Engine V2 — safe unpair (soft disconnect, preserve device row for history).
 */

import { broadcastSse } from '../realtime/simpleSse.js';
import { upsertDeviceMetadata, readDeviceMetadata } from '../lib/deviceProjection.js';
import { enqueueDeviceCommand } from '../engines/device/commands.js';
import { addDeviceLog } from '../engines/device/logs.js';

const ACTIVE_BINDING_STATUSES = ['ready', 'pending', 'active', 'assigned'];

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
      pairingCode: null,
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

    const metadataPatch = {
      pairingStatus: 'UNPAIRED',
      currentPlaylistId: null,
      unpairedAt: new Date().toISOString(),
      unpairReason: reason,
    };

    if (archive) {
      const cap = device.capabilities?.[0];
      const prev =
        cap?.capabilities && typeof cap.capabilities === 'object' ? cap.capabilities : {};
      metadataPatch.archivedAt = new Date().toISOString();
      metadataPatch.archiveReason = reason || 'manual_unpair';
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
      pairingStatus: 'UNPAIRED',
    });

    return updatedDevice;
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

  const ssePayload = {
    deviceId: result.id,
    pairingStatus: metadata.pairingStatus || 'UNPAIRED',
    tenantId: result.tenantId,
    storeId: result.storeId,
    playlistId: null,
    currentPlaylistId: null,
    status: result.status,
    lastSeenAt: result.lastSeenAt?.toISOString?.() ?? null,
    reason,
    archived: archive,
    at: new Date().toISOString(),
  };

  broadcastSse('admin', 'device.status.changed', ssePayload);
  broadcastSse('admin', 'device:update', ssePayload);
  broadcastSse('admin', 'device:unpaired', ssePayload);

  await addDeviceLog({
    deviceId,
    source: 'pairing',
    level: 'info',
    message: 'Device unpaired',
    payload: {
      reason,
      resetToTemp,
      archive,
      bindingsCleared,
      commandId,
    },
  });

  console.log('[DEVICE_UNPAIR_COMPLETE]', {
    deviceId,
    bindingsCleared,
    commandId,
    tenantId: result.tenantId,
    storeId: result.storeId,
  });

  return {
    ok: true,
    deviceId: result.id,
    pairingStatus: 'UNPAIRED',
    tenantId: result.tenantId,
    storeId: result.storeId,
    playlistId: null,
    bindingsCleared,
    commandId,
    archived: archive,
    resetToTemp,
  };
}
