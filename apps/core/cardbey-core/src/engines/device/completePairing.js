/**
 * Complete Pairing Tool - Canonical Contract
 * Dashboard-initiated pairing completion (no auth required)
 */

import { getPrismaClient } from '../../db/prisma.js';
import { getEventEmitter, DEVICE_EVENTS } from './events.js';
import { broadcastSse } from '../../realtime/simpleSse.js';
import { emitDeviceEvent, DEVICE_ENGINE_EVENT_TYPES } from './deviceEvents.js';

const prisma = getPrismaClient();

/**
 * Normalize pairing code (uppercase, trim)
 */
function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

/**
 * Resolve pending pairing session: prefer sessionId, else unique pending row by code.
 */
async function resolvePendingPairingDevice(db, { normalizedCode, resolvedSessionId }) {
  if (resolvedSessionId) {
    const byId = await db.device.findUnique({ where: { id: resolvedSessionId } });
    return { device: byId, resolveMode: 'sessionId' };
  }

  if (!normalizedCode) {
    return { device: null, resolveMode: 'none' };
  }

  const candidates = await db.device.findMany({
    where: {
      pairingCode: normalizedCode,
      OR: [
        { tenantId: 'temp', storeId: 'temp' },
        { pairingCode: { not: null } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const pending = candidates.filter(
    (d) => d.pairingCode && normalizeCode(d.pairingCode) === normalizedCode
  );

  if (pending.length === 1) {
    return { device: pending[0], resolveMode: 'pairingCode' };
  }
  if (pending.length > 1) {
    console.warn('[PAIRING_RESOLVE] Ambiguous pairingCode — multiple pending sessions', {
      pairingCode: normalizedCode,
      deviceIds: pending.map((d) => d.id),
    });
    throw new Error('Ambiguous pairing code — provide sessionId from the pairing alert');
  }

  return { device: null, resolveMode: 'pairingCode' };
}

function assertIdentityCommitted(updated, { tenantId, storeId, normalizedCode }) {
  const stillTemp =
    !updated?.tenantId ||
    updated.tenantId === 'temp' ||
    !updated?.storeId ||
    updated.storeId === 'temp';

  if (stillTemp) {
    console.error('[PAIRING_FAILED] CRITICAL: pairing reported success but identity still temp', {
      deviceId: updated?.id,
      tenantId: updated?.tenantId,
      storeId: updated?.storeId,
      pairingCode: normalizedCode,
      intendedTenantId: tenantId,
      intendedStoreId: storeId,
    });
    throw new Error('Pairing did not commit tenant/store identity');
  }
}

/**
 * Complete pairing
 * Links device to tenant/store and clears pairing code
 *
 * @param {object} input - CompletePairingInput
 * @param {object} ctx - Execution context
 * @returns {Promise<object>} CompletePairingOutput
 */
export const completePairing = async (input, ctx) => {
  const { pairingCode, tenantId, storeId, name, location, sessionId, deviceId } = input;

  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();

  const normalizedCode = normalizeCode(pairingCode);
  const resolvedSessionId = String(sessionId || deviceId || '').trim();

  console.log('[PAIRING_START]', {
    sessionId: resolvedSessionId || null,
    pairingCode: normalizedCode || null,
    tenantId,
    storeId,
  });

  if (!normalizedCode) {
    console.error('[PAIRING_FAILED]', { reason: 'missing_pairing_code' });
    throw new Error('pairingCode is required');
  }

  if (!tenantId || String(tenantId).trim() === '' || tenantId === 'temp') {
    console.error('[PAIRING_FAILED]', { reason: 'invalid_tenantId', tenantId });
    throw new Error('tenantId is required (non-temp)');
  }
  if (!storeId || String(storeId).trim() === '' || storeId === 'temp') {
    console.error('[PAIRING_FAILED]', { reason: 'invalid_storeId', storeId });
    throw new Error('storeId is required (non-temp)');
  }

  let device;
  let resolveMode;
  try {
    const resolved = await resolvePendingPairingDevice(db, {
      normalizedCode,
      resolvedSessionId,
    });
    device = resolved.device;
    resolveMode = resolved.resolveMode;

    console.log('[PAIRING_RESOLVE]', {
      resolveMode,
      foundDevice: !!device,
      deviceId: device?.id || null,
      hasPairingCode: !!device?.pairingCode,
      currentTenantId: device?.tenantId || null,
      currentStoreId: device?.storeId || null,
    });
  } catch (resolveErr) {
    console.error('[PAIRING_FAILED]', {
      phase: 'resolve',
      message: resolveErr?.message,
    });
    throw resolveErr;
  }

  if (!device) {
    console.error('[PAIRING_FAILED]', { reason: 'session_not_found', resolveMode });
    throw new Error('Pairing session not found');
  }
  if (!device.pairingCode) {
    console.error('[PAIRING_FAILED]', { reason: 'not_pending', deviceId: device.id });
    throw new Error('Pairing session is not pending');
  }
  if (normalizeCode(device.pairingCode) !== normalizedCode) {
    console.error('[PAIRING_FAILED]', {
      reason: 'invalid_code',
      deviceId: device.id,
      expected: device.pairingCode,
      received: normalizedCode,
    });
    throw new Error('Invalid pairing code');
  }

  if (device.storeId && device.storeId !== 'temp' && storeId && device.storeId !== storeId) {
    console.warn('[PAIRING_FAILED]', {
      reason: 'store_mismatch',
      deviceId: device.id,
      existingStoreId: device.storeId,
      selectedStoreId: storeId,
    });
    throw new Error('Device already assigned to another store');
  }

  const oldTenantId = device.tenantId;
  const oldStoreId = device.storeId;

  const now = new Date();
  const createdAt = device.createdAt;
  const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000);
  if (now > expiresAt) {
    console.error('[PAIRING_FAILED]', {
      reason: 'expired',
      deviceId: device.id,
      expiresAt: expiresAt.toISOString(),
    });
    throw new Error('Pairing code has expired');
  }

  let updated;
  try {
    console.log('[PAIRING_DB_WRITE]', {
      deviceId: device.id,
      tenantId,
      storeId,
      resolveMode,
    });

    updated = await db.device.update({
      where: { id: device.id },
      data: {
        tenantId,
        storeId,
        name: name || device.name || null,
        location: location || device.location || null,
        pairingCode: null,
        status: 'online',
        lastSeenAt: now,
        appVersion: device.appVersion || 'DEVICE_V2',
      },
      select: {
        id: true,
        name: true,
        platform: true,
        type: true,
        status: true,
        lastSeenAt: true,
        tenantId: true,
        storeId: true,
        pairingCode: true,
      },
    });
  } catch (dbErr) {
    console.error('[PAIRING_FAILED]', {
      phase: 'db_write',
      deviceId: device.id,
      message: dbErr?.message,
    });
    throw dbErr;
  }

  assertIdentityCommitted(updated, { tenantId, storeId, normalizedCode });

  console.log('[PAIRING_COMPLETE]', {
    deviceId: updated.id,
    pairingCode: normalizedCode,
    resolveMode,
    oldTenantId,
    oldStoreId,
    newTenantId: updated.tenantId,
    newStoreId: updated.storeId,
    pairingCodeCleared: updated.pairingCode == null,
  });

  try {
    emitDeviceEvent({
      type: DEVICE_ENGINE_EVENT_TYPES.PAIRING_CLAIMED,
      payload: {
        sessionId: device.id,
        deviceId: updated.id,
        code: normalizedCode,
        tenantId,
        storeId,
        name: updated.name,
        status: updated.status,
        engine: 'DEVICE_V2',
      },
    });
  } catch (eventError) {
    console.error('[PAIRING_FAILED] emit pairing.claimed (non-fatal):', eventError);
  }

  await events.emit(DEVICE_EVENTS.PAIRED, {
    tenantId,
    storeId,
    deviceId: updated.id,
    name: updated.name,
    status: updated.status,
  });

  broadcastSse('admin', 'device:paired', {
    deviceId: updated.id,
    name: updated.name,
    platform: updated.platform || null,
    type: updated.type || 'screen',
    status: updated.status,
    lastSeenAt: updated.lastSeenAt?.toISOString() || null,
    tenantId: updated.tenantId,
    storeId: updated.storeId,
  });

  broadcastSse('admin', 'device:update', {
    deviceId: updated.id,
    status: updated.status,
    lastSeenAt: updated.lastSeenAt?.toISOString() || null,
    tenantId: updated.tenantId,
    storeId: updated.storeId,
    name: updated.name,
  });

  return {
    ok: true,
    deviceId: updated.id,
    status: updated.status,
    type: updated.type || 'screen',
    storeId: updated.storeId,
    data: {
      device: {
        id: updated.id,
        name: updated.name,
        status: updated.status,
        type: updated.type || 'screen',
        platform: updated.platform,
        tenantId: updated.tenantId,
        storeId: updated.storeId,
        lastSeenAt: updated.lastSeenAt?.toISOString() || null,
      },
    },
  };
};
