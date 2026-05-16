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
 * Complete pairing
 * Links device to tenant/store and clears pairing code
 * 
 * @param {object} input - CompletePairingInput
 * @param {object} ctx - Execution context
 * @returns {Promise<object>} CompletePairingOutput
 */
export const completePairing = async (input, ctx) => {
  const { pairingCode, tenantId, storeId, name, location, sessionId, deviceId } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();

  const normalizedCode = normalizeCode(pairingCode);
  const resolvedSessionId = String(sessionId || deviceId || '').trim();
  if (!resolvedSessionId) {
    throw new Error('sessionId is required');
  }

  // Fail-fast: identity must be real (never commit temp/temp)
  if (!tenantId || String(tenantId).trim() === '' || tenantId === 'temp') {
    throw new Error('tenantId is required (non-temp)');
  }
  if (!storeId || String(storeId).trim() === '' || storeId === 'temp') {
    throw new Error('storeId is required (non-temp)');
  }

  console.log('[PAIRING LOOKUP INPUT]', {
    sessionId: resolvedSessionId,
    pairingCode: normalizedCode,
    tenantId,
    storeId,
  });

  console.log('[Complete Pairing] Resolving session', { sessionId: resolvedSessionId });

  // Deterministic resolution: pairingCode + sessionId must resolve exactly one device row.
  const device = await db.device.findUnique({
    where: { id: resolvedSessionId },
  });

  console.log('[PAIRING LOOKUP RESULT]', {
    foundDevice: !!device,
    deviceId: device?.id || null,
    hasPairingCode: !!device?.pairingCode,
    currentTenantId: device?.tenantId || null,
    currentStoreId: device?.storeId || null,
  });

  if (!device) throw new Error('Pairing session not found');
  if (!device.pairingCode) throw new Error('Pairing session is not pending');
  if (normalizeCode(device.pairingCode) !== normalizedCode) throw new Error('Invalid pairing code');

  // Reject mismatched pairing: if device already has a real store assignment that differs from selected store.
  if (device.storeId && device.storeId !== 'temp' && storeId && device.storeId !== storeId) {
    console.warn('[Complete Pairing] Store mismatch on pairing attempt', {
      deviceId: device.id,
      existingStoreId: device.storeId,
      selectedStoreId: storeId,
      tenantId,
    });
    throw new Error('Device already assigned to another store');
  }

  const oldTenantId = device.tenantId;
  const oldStoreId = device.storeId;

  console.log('[Complete Pairing] Found device:', {
    deviceId: device.id,
    pairingCode: device.pairingCode,
    createdAt: device.createdAt,
  });

  // Check if pairing code has expired (10 minutes from device creation)
  const now = new Date();
  const createdAt = device.createdAt;
  const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000);
  const ageMs = now.getTime() - createdAt.getTime();
  const ageMinutes = Math.round((ageMs / 1000 / 60) * 10) / 10;
  
  console.log('[Complete Pairing] Pairing code age:', {
    ageMinutes,
    expiresAt: expiresAt.toISOString(),
    now: now.toISOString(),
    expired: now > expiresAt,
  });

  if (now > expiresAt) {
    throw new Error('Pairing code has expired');
  }

  // Update device with tenant/store info and clear pairing code
  // Ensure all required fields are set: id, tenantId, storeId, name, pairedAt
  // Also set engineVersion to "V2" to mark this as DeviceEngine V2 device
  const updated = await db.device.update({
    where: { id: device.id },
    data: {
      id: device.id, // Explicitly set id
      tenantId, // Required: tenantId
      storeId, // Required: storeId
      name: name || device.name || null, // Required: name
      location: location || device.location || null,
      pairingCode: null, // Clear pairing code after successful pairing
      status: 'online',
      lastSeenAt: new Date(), // Use lastSeenAt, not lastSeen
      appVersion: device.appVersion || 'V2', // Ensure engineVersion is set to V2
      // Note: Device model doesn't have pairedAt field, but we set lastSeenAt to track pairing time
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

  console.log('[Complete Pairing] Device updated:', {
    deviceId: updated.id,
    tenantId: updated.tenantId,
    storeId: updated.storeId,
    name: updated.name,
    paired: !updated.pairingCode && updated.tenantId !== 'temp',
  });

  console.log('[PAIRING COMMIT RESULT]', {
    deviceId: updated.id,
    committedTenantId: updated.tenantId,
    committedStoreId: updated.storeId,
    pairingCodeCleared: updated.pairingCode == null,
  });

  console.log('[PAIRING COMPLETE]', {
    deviceId: updated.id,
    pairingCode: normalizedCode,
    oldTenantId,
    oldStoreId,
    newTenantId: updated.tenantId,
    newStoreId: updated.storeId,
    dashboardStoreId: storeId,
    authTenantId: tenantId,
    result: 'ok',
  });
  
  // Add structured logging for complete-pairing
  console.log(`[DeviceEngine V2] complete-pairing`, {
    code: normalizedCode,
    deviceId: updated.id,
    tenantId,
    storeId,
    name: updated.name,
    status: updated.status,
  });

  // Emit DeviceEngine V2 pairing.claimed event
  try {
    emitDeviceEvent({
      type: DEVICE_ENGINE_EVENT_TYPES.PAIRING_CLAIMED,
      payload: {
        sessionId: device.id, // Device ID was the session ID
        deviceId: updated.id,
        code: normalizedCode,
        tenantId,
        storeId,
        name: updated.name,
        status: updated.status,
        engine: 'DEVICE_V2',
      },
    });
    console.log(`[DeviceEngine V2] Emitted pairing.claimed event for device ${updated.id}`);
  } catch (eventError) {
    console.error('[DeviceEngine V2] Failed to emit pairing.claimed event (non-fatal):', eventError);
  }

  // Emit legacy event (will be broadcast to SSE as device_paired)
  await events.emit(DEVICE_EVENTS.PAIRED, {
    tenantId,
    storeId,
    deviceId: updated.id,
    name: updated.name,
    status: updated.status,
  });

  // Also emit legacy SSE event for backward compatibility
  broadcastSse('admin', 'device:paired', {
    deviceId: updated.id,
    name: updated.name,
    platform: updated.platform || null,
    type: updated.type || 'screen',
    status: updated.status,
    lastSeenAt: updated.lastSeenAt?.toISOString() || null,
  });
  
  // Broadcast device:update event for real-time dashboard updates
  broadcastSse('admin', 'device:update', {
    deviceId: updated.id,
    status: updated.status,
    lastSeenAt: updated.lastSeenAt?.toISOString() || null,
    tenantId,
    storeId,
    name: updated.name,
  });

  // Return response in format expected by dashboard
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
        tenantId,
        storeId: updated.storeId,
        lastSeenAt: updated.lastSeenAt?.toISOString() || null,
      },
    },
  };
};
