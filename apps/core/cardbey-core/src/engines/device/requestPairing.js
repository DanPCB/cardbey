/**
 * Request Pairing Tool - Canonical Contract
 * Device-initiated pairing request (no auth required)
 */

import { getPrismaClient } from '../../db/prisma.js';
import { getEventEmitter, DEVICE_EVENTS } from './events.js';
import { emitDeviceEvent, DEVICE_ENGINE_EVENT_TYPES } from './deviceEvents.js';
import crypto from 'crypto';

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

    const { deviceModel, platform, appVersion, capabilities, initialState } = input;

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

    // Pairing code expires in 10 minutes
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

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

    console.log(`[DeviceEngine V2] [${requestId}] Creating device record in DB`);

    // Create device (without tenantId/storeId - will be set during complete-pairing)
    // Store fields in existing Device columns:
    // - deviceModel -> model
    // - appVersion -> appVersion (set to "DEVICE_V2" for DeviceEngine V2)
    // - platform -> platform (new field)
    // - type -> type (new field, inferred from platform or explicit deviceType)
    // - capabilities, initialState -> DeviceCapability.capabilities JSON
    const device = await db.device.create({
      data: {
        tenantId: 'temp', // Temporary, will be updated on complete-pairing
        storeId: 'temp', // Temporary, will be updated on complete-pairing
        pairingCode,
        model: deviceModel || null, // Store in existing model column
        status: 'offline',
        appVersion: 'DEVICE_V2', // Explicitly set engineVersion to V2 for DeviceEngine V2 devices
        platform: platform || null, // Store platform directly
        type: deviceType, // Store inferred or explicit device type
      },
    });

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
    const capabilityData = {
      ...(capabilities || {}),
      platform: platform || null,
      initialState: initialState || {},
    };

    console.log(`[DeviceEngine V2] [${requestId}] Upserting device capabilities`);

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

    console.log(`[DeviceEngine V2] [${requestId}] requestPairing() success`, {
      id: result.id,
      code: result.code,
      expiresAt: result.expiresAt,
      deviceId: result.deviceId, // For logging
    });

    return result;
  } catch (error) {
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
