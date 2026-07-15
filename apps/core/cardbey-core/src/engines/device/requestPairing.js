/**
 * Request Pairing Tool - Canonical Contract
 * Device-initiated pairing request (no auth required)
 */

import { getPrismaClient } from '../../db/prisma.js';
import { getEventEmitter, DEVICE_EVENTS } from './events.js';
import { emitDeviceEvent, DEVICE_ENGINE_EVENT_TYPES } from './deviceEvents.js';
import crypto from 'crypto';
import {
  PAIRING_TTL_MS,
  pairingExpiresAt,
  pairingTtlLeftMs,
} from './pairingSessionTiming.js';
import {
  logDeviceIdentityEvent,
  persistInstallationId,
  resolveCanonicalDevice,
  isDeviceArchived,
  hashInstallationId,
  normalizeInstallationId,
} from '../../lib/deviceIdentity.js';
import { readDeviceMetadata } from '../../lib/deviceProjection.js';

const prisma = getPrismaClient();

/**
 * Generate a unique pairing code (6 characters)
 */
function generatePairingCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase().substring(0, 6);
}

/**
 * Request pairing
 * Creates a device record with a pairing code
 * 
 * @param {object} input - RequestPairingInput
 * @param {object} ctx - Execution context
 * @returns {Promise<object>} RequestPairingOutput with { deviceId, pairingCode, expiresAt }
 * @throws {Error} If pairing fails
 */
export const requestPairing = async (input, ctx) => {
  const requestId = Math.random().toString(36).slice(2, 9);
  
  try {
    console.log('[REQUEST_PAIRING_START]', {
      requestId,
      phase: 'service',
    });
    console.log(`[DeviceEngine V2] [${requestId}] requestPairing() start`, {
      input: {
        deviceModel: input.deviceModel,
        platform: input.platform,
        appVersion: input.appVersion,
        hasCapabilities: !!input.capabilities && Object.keys(input.capabilities || {}).length > 0,
        hasInitialState: !!input.initialState && Object.keys(input.initialState || {}).length > 0,
        deviceType: input.deviceType,
      },
    });

    const {
      deviceModel,
      platform,
      appVersion,
      capabilities,
      initialState,
      deviceId: inputDeviceId,
      installationId: inputInstallationId,
    } = input;
    const clientDeviceId = inputDeviceId ? String(inputDeviceId).trim() : '';
    const clientInstallationId = normalizeInstallationId(inputInstallationId) || '';

    // Use provided context or create default
    const db = ctx?.services?.db || prisma;
    const events = ctx?.services?.events || getEventEmitter();

    // Validate database connection
    if (!db || !db.device) {
      console.error(`[DeviceEngine V2] [${requestId}] Database not available`);
      throw new Error('Database connection not available');
    }

    console.log(`[DeviceEngine V2] [${requestId}] Generating unique pairing code`);

    // Generate unique pairing code
    let pairingCode;
    let attempts = 0;
    do {
      pairingCode = generatePairingCode();
      const existing = await db.device.findUnique({
        where: { pairingCode },
      });
      if (!existing) break;
      attempts++;
      if (attempts > 10) {
        console.error(`[DeviceEngine V2] [${requestId}] Failed to generate unique pairing code after ${attempts} attempts`);
        throw new Error('Failed to generate unique pairing code');
      }
    } while (true);

    console.log(`[DeviceEngine V2] [${requestId}] Generated pairing code: ${pairingCode}`);

    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
    const pairingCodeIssuedAt = new Date().toISOString();

    // Infer device type from platform or use explicit deviceType from input
    console.log(`[DeviceEngine V2] [${requestId}] Inferring device type`, {
      platform,
      explicitDeviceType: input.deviceType,
    });

    let deviceType;
    try {
      const { inferDeviceType } = await import('./deviceType.js');
      const explicitDeviceType = input.deviceType;
      // If explicit deviceType is provided and is valid, use it directly
      // Otherwise infer from platform
      const validTypes = ['screen', 'pos', 'drone', 'robot', 'other'];
      deviceType = (explicitDeviceType && validTypes.includes(explicitDeviceType.toLowerCase()))
        ? explicitDeviceType.toLowerCase()
        : inferDeviceType(platform);
      
      console.log(`[DeviceEngine V2] [${requestId}] Device type inferred: ${deviceType}`);
    } catch (importError) {
      console.error(`[DeviceEngine V2] [${requestId}] Error importing deviceType module:`, importError);
      // Fallback to 'screen' if deviceType import fails
      deviceType = 'screen';
      console.warn(`[DeviceEngine V2] [${requestId}] Using fallback device type: ${deviceType}`);
    }

    console.log(`[DeviceEngine V2] [${requestId}] Creating or updating device record in DB`, {
      clientDeviceId: clientDeviceId || null,
      installationIdHash: hashInstallationId(clientInstallationId),
    });

    const deviceData = {
      tenantId: 'temp',
      storeId: 'temp',
      pairingCode,
      model: deviceModel || null,
      status: 'offline',
      appVersion: 'DEVICE_V2',
      platform: platform || null,
      type: deviceType,
      ...(clientInstallationId ? { installationId: clientInstallationId } : {}),
    };

    let device;
    let effectiveDeviceId = clientDeviceId;
    let matchReason = null;

    // Primary reconcile: stable physical installationId (must not create duplicates).
    const resolved = await resolveCanonicalDevice(db, {
      deviceId: clientDeviceId,
      installationId: clientInstallationId,
    });
    if (resolved.device) {
      const capRow = await db.deviceCapability.findUnique({
        where: { deviceId: resolved.device.id },
        select: { capabilities: true },
      });
      const meta = readDeviceMetadata(capRow);
      if (isDeviceArchived(meta) || isDeviceArchived(capRow?.capabilities)) {
        logDeviceIdentityEvent('DEVICE_RECORD_MATCHED', {
          deviceId: resolved.device.id,
          installationId: clientInstallationId,
          canonicalDeviceId: resolved.device.id,
          reason: 'archived_blocking_reuse',
        });
        const err = new Error('Device installation is archived; contact support');
        err.code = 'DEVICE_ARCHIVED';
        throw err;
      }

      effectiveDeviceId = resolved.device.id;
      matchReason = resolved.matchReason;
      logDeviceIdentityEvent('DEVICE_RECORD_MATCHED', {
        deviceId: effectiveDeviceId,
        installationId: clientInstallationId,
        canonicalDeviceId: effectiveDeviceId,
        reason: matchReason,
      });
    }

    // Legacy orphan reconcile only when no installation/device identity is available.
    if (!effectiveDeviceId && !clientInstallationId) {
      const recentCutoff = new Date(Date.now() - 2 * 60 * 1000);
      const orphans = await db.device.findMany({
        where: {
          tenantId: 'temp',
          storeId: 'temp',
          pairingCode: null,
          lastSeenAt: { gte: recentCutoff },
        },
        orderBy: { lastSeenAt: 'desc' },
        take: 2,
        select: { id: true, lastSeenAt: true },
      });
      if (orphans.length >= 1) {
        effectiveDeviceId = orphans[0].id;
        matchReason = 'recent_temp_orphan';
        console.log(`[DeviceEngine V2] [${requestId}] Reconciled recent heartbeat row for pairing`, {
          deviceId: effectiveDeviceId,
          lastSeenAt: orphans[0].lastSeenAt?.toISOString?.(),
          orphanCount: orphans.length,
        });
      }
    }

    // Prefer client installationId as the durable row id when minting a new record.
    if (!effectiveDeviceId && clientInstallationId) {
      effectiveDeviceId = clientInstallationId;
    }

    if (effectiveDeviceId) {
      const existing = await db.device.findUnique({ where: { id: effectiveDeviceId } });
      if (existing) {
        if (
          existing.tenantId !== 'temp' &&
          existing.storeId !== 'temp' &&
          !existing.pairingCode
        ) {
          console.log(`[DeviceEngine V2] [${requestId}] Device already paired — returning alreadyPaired`, {
            deviceId: existing.id,
            tenantId: existing.tenantId,
            storeId: existing.storeId,
          });
          if (clientInstallationId) {
            await persistInstallationId(db, existing.id, clientInstallationId);
          }
          return {
            alreadyPaired: true,
            id: existing.id,
            deviceId: existing.id,
            tenantId: existing.tenantId,
            storeId: existing.storeId,
            status: 'claimed',
            installationId: clientInstallationId || existing.installationId || null,
          };
        }
        if (
          existing.pairingCode &&
          existing.tenantId === 'temp' &&
          existing.storeId === 'temp'
        ) {
          const ttlLeft = pairingTtlLeftMs(existing);
          if (ttlLeft > 0) {
            const pendingExpiresAt = pairingExpiresAt(existing);
            console.log(`[DeviceEngine V2] [${requestId}] Reusing active pairing code`, {
              deviceId: existing.id,
              code: existing.pairingCode,
              expiresAt: pendingExpiresAt.toISOString(),
              ttlLeftMs: ttlLeft,
            });
            if (clientInstallationId) {
              await persistInstallationId(db, existing.id, clientInstallationId, {
                pairingStatus: 'CLAIMABLE',
              });
            }
            return {
              id: existing.id,
              code: existing.pairingCode,
              expiresAt: pendingExpiresAt.toISOString(),
              deviceId: existing.id,
              pairingCode: existing.pairingCode,
              installationId: clientInstallationId || existing.installationId || null,
            };
          }
        }
        const updatePayload = {
          ...deviceData,
          status: existing.status === 'online' ? 'online' : deviceData.status,
          model: deviceModel || existing.model,
          platform: platform || existing.platform,
          type: deviceType || existing.type,
        };
        // Never overwrite installationId with null; never use store/owner as identity.
        if (!clientInstallationId) {
          delete updatePayload.installationId;
        }
        try {
          device = await db.device.update({
            where: { id: effectiveDeviceId },
            data: updatePayload,
          });
        } catch (updateErr) {
          if (String(updateErr?.message || '').includes('installationId')) {
            delete updatePayload.installationId;
            device = await db.device.update({
              where: { id: effectiveDeviceId },
              data: updatePayload,
            });
          } else {
            throw updateErr;
          }
        }
        logDeviceIdentityEvent('DEVICE_RECORD_MATCHED', {
          deviceId: device.id,
          installationId: clientInstallationId,
          reason: matchReason || 'update_existing',
        });
      } else {
        try {
          device = await db.device.create({
            data: { id: effectiveDeviceId, ...deviceData },
          });
        } catch (createErr) {
          if (String(createErr?.message || '').includes('installationId')) {
            const { installationId: _omit, ...withoutInstall } = deviceData;
            device = await db.device.create({
              data: { id: effectiveDeviceId, ...withoutInstall },
            });
          } else {
            throw createErr;
          }
        }
        logDeviceIdentityEvent('DEVICE_RECORD_CREATED', {
          deviceId: device.id,
          installationId: clientInstallationId,
          reason: 'request_pairing_create',
        });
      }
    } else {
      try {
        device = await db.device.create({ data: deviceData });
      } catch (createErr) {
        if (String(createErr?.message || '').includes('installationId')) {
          const { installationId: _omit, ...withoutInstall } = deviceData;
          device = await db.device.create({ data: withoutInstall });
        } else {
          throw createErr;
        }
      }
      logDeviceIdentityEvent('DEVICE_RECORD_CREATED', {
        deviceId: device.id,
        installationId: clientInstallationId,
        reason: 'request_pairing_create_no_client_id',
      });
    }

    if (clientInstallationId) {
      await persistInstallationId(db, device.id, clientInstallationId, {
        pairingStatus: 'CLAIMABLE',
        pairingCodeIssuedAt,
      });
    }

    console.log(`[DeviceEngine V2] [${requestId}] Created pair session`, {
      sessionId: device.id,
      code: device.pairingCode,
      deviceType: device.type,
      platform: device.platform,
      expiresAt: expiresAt.toISOString(),
    });
    
    // Add structured logging for request-pairing
    console.log(`[DeviceEngine V2] request-pairing`, {
      sessionId: device.id,
      code: device.pairingCode,
      tenantId: 'temp', // Will be set during complete-pairing
      storeId: 'temp',  // Will be set during complete-pairing
      expiresAt: expiresAt.toISOString(),
      deviceType: device.type,
      platform: device.platform,
    });

    // Store capabilities, platform, and initialState in DeviceCapability table
    // This uses the existing JSON field to store all additional metadata
    const existingCap = await db.deviceCapability.findUnique({
      where: { deviceId: device.id },
      select: { capabilities: true },
    });
    const priorCaps =
      existingCap?.capabilities && typeof existingCap.capabilities === 'object'
        ? existingCap.capabilities
        : {};

    const capabilityData = {
      ...priorCaps,
      ...(capabilities || {}),
      platform: platform || priorCaps.platform || null,
      initialState: initialState || priorCaps.initialState || {},
      pairingCodeIssuedAt,
    };

    console.log(`[DeviceEngine V2] [${requestId}] Upserting device capabilities`, {
      pairingCodeIssuedAt,
    });

    await db.deviceCapability.upsert({
      where: { deviceId: device.id },
      update: {
        capabilities: capabilityData,
      },
      create: {
        deviceId: device.id,
        capabilities: capabilityData,
      },
    });

    console.log(`[DeviceEngine V2] [${requestId}] Device capabilities stored`);

    // Emit legacy event (for backward compatibility)
    try {
      await events.emit(DEVICE_EVENTS.PAIRING_REQUESTED, {
        deviceId: device.id,
        pairingCode,
        deviceModel,
        platform,
        appVersion,
        expiresAt: expiresAt.toISOString(),
      });
      console.log(`[DeviceEngine V2] [${requestId}] Legacy event emitted: PAIRING_REQUESTED`);
    } catch (eventError) {
      // Don't fail pairing if event emission fails
      console.warn(`[DeviceEngine V2] [${requestId}] Failed to emit legacy event (non-fatal):`, eventError.message);
    }

    // Emit Device V2 pairing requested event (for dashboard real-time updates)
    // This event triggers the "New device wants to pair" popup on the Devices page
    console.log(`[DeviceEngine V2] [${requestId}] Emitting device.pairing.requested event`);
    try {
      const eventPayload = {
        sessionId: device.id,  // Device ID acts as session ID
        code: pairingCode,
        engine: 'DEVICE_V2',
        deviceType: deviceType || 'screen',
        tenantId: 'temp',  // Will be set during claim
        storeId: 'temp',   // Will be set during claim
        expiresAt: expiresAt.toISOString(),
        createdAt: device.createdAt.toISOString(), // Include createdAt for frontend use
      };
      
      emitDeviceEvent({
        type: DEVICE_ENGINE_EVENT_TYPES.PAIRING_REQUESTED,
        payload: eventPayload,
      });
      
      // Add structured logging as requested for core logs
      console.log(`[DeviceEngine V2] emit device.pairing.requested`, {
        sessionId: eventPayload.sessionId,
        code: eventPayload.code,
        tenantId: eventPayload.tenantId,
        storeId: eventPayload.storeId,
        engine: eventPayload.engine,
        deviceType: eventPayload.deviceType,
        expiresAt: eventPayload.expiresAt,
        createdAt: eventPayload.createdAt,
      });
      
      console.log(`[DeviceEngine V2] [${requestId}] Device V2 event emitted: device.pairing.requested`, {
        sessionId: eventPayload.sessionId,
        code: eventPayload.code,
        engine: eventPayload.engine,
      });
    } catch (eventError) {
      // Don't fail pairing if event emission fails
      console.error(`[DeviceEngine V2] [${requestId}] Failed to emit Device V2 event (non-fatal):`, {
        message: eventError.message,
        stack: eventError.stack,
      });
    }

    // Return canonical Device V2 response format
    // Map internal field names to tablet-expected format
    const result = {
      id: device.id,              // Will be mapped to sessionId in route handler
      code: pairingCode,          // Will be returned as 'code' to tablet
      expiresAt: expiresAt.toISOString(),
      // Also include deviceId for backward compatibility/internal use
      deviceId: device.id,
      pairingCode: pairingCode,
    };

    console.log('[REQUEST_PAIRING_RESPONSE]', {
      requestId,
      deviceId: result.deviceId,
      code: result.code,
      expiresAt: result.expiresAt,
    });
    console.log(`[DeviceEngine V2] [${requestId}] requestPairing() success`, {
      id: result.id,
      code: result.code,
      expiresAt: result.expiresAt,
      deviceId: result.deviceId,
    });

    return result;
  } catch (error) {
    console.error('[REQUEST_PAIRING_FAILED]', {
      requestId,
      phase: 'service',
      message: error?.message,
    });
    console.error(`[DeviceEngine V2] [${requestId}] requestPairing() internal error`, {
      message: error?.message,
      name: error?.name,
      code: error?.code,
      stack: error?.stack,
      cause: error?.cause,
    });
    
    // Re-throw to be caught by route handler
    throw error;
  }
};
