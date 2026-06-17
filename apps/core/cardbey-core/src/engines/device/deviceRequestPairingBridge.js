/**
 * Shared Device V2 request-pairing execution (HTTP + legacy screen routes).
 */

import { getPrismaClient } from '../../db/prisma.js';
import { getEventEmitter } from './events.js';
import { broadcastSse } from '../../realtime/simpleSse.js';
import { broadcast as broadcastWebsocket } from '../../realtime/websocket.js';
import { requestPairing } from './requestPairing.js';
import { pairingExpiresAt, pairingTtlLeftMs } from './pairingSessionTiming.js';

const prisma = getPrismaClient();

function createEngineContext() {
  return {
    services: {
      db: prisma,
      events: getEventEmitter(),
    },
  };
}

function normalizeIncomingBody(raw = {}) {
  const body = { ...raw };
  if (body.deviceType && !body.deviceModel) {
    body.deviceModel = body.deviceType;
  }
  if (body.hardwareModel && !body.deviceModel) {
    body.deviceModel = body.hardwareModel;
  }
  if (body.model && !body.deviceModel) {
    body.deviceModel = body.model;
  }
  if (body.label && !body.platform) {
    body.platform = body.label;
  }
  const deviceId = body.deviceId
    ? String(body.deviceId).trim()
    : body.fingerprint
      ? String(body.fingerprint).trim()
      : body.sessionId
        ? String(body.sessionId).trim()
        : '';

  const engineVersion =
    body.engineVersion || body.engine || body.appVersion || 'DEVICE_V2';

  return {
    deviceId: deviceId || undefined,
    deviceModel: body.deviceModel || body.model || 'unknown-model',
    platform: body.platform || 'android_tv',
    appVersion: engineVersion,
    engineVersion,
    capabilities: body.capabilities || {},
    initialState: body.initialState || {},
    deviceType: body.deviceType || 'screen',
    name: body.name,
    location: body.location,
  };
}

function emitPairAlertEvent(payload) {
  const pairAlertEnvelope = {
    type: 'pair_alert',
    data: payload,
  };

  broadcastSse('admin', 'pair_alert', pairAlertEnvelope);

  const pairingRequestedPayload = {
    type: 'device.pairing.requested',
    payload: {
      sessionId: payload.deviceId,
      deviceId: payload.deviceId,
      deviceName: payload.deviceName,
      deviceType: payload.deviceType,
      code: payload.code,
      engine: 'DEVICE_V2',
      tenantId: payload.tenantId || 'temp',
      storeId: payload.storeId || 'temp',
      expiresAt: payload.expiresAt,
      createdAt: payload.timestamp,
    },
  };

  broadcastSse('admin', 'device.pairing.requested', pairingRequestedPayload);
  broadcastWebsocket(
    { type: 'pair_alert', payload },
    { key: 'admin' }
  );
  broadcastWebsocket(
    { type: 'device.pairing.requested', payload: pairingRequestedPayload.payload },
    { key: 'admin' }
  );
}

/**
 * Run Device V2 request-pairing from any caller (device route or legacy screen shim).
 *
 * @param {{ body?: object, req?: import('express').Request, source?: string }} opts
 * @returns {Promise<{ ok: true, sessionId: string, code: string, expiresAt: string, deviceId: string }>}
 */
export async function executeDeviceRequestPairing(opts = {}) {
  const { body: rawBody = {}, req, source = 'device_route' } = opts;
  const requestId = Math.random().toString(36).slice(2, 9);
  const input = normalizeIncomingBody(rawBody);

  console.log('[REQUEST_PAIRING_START]', {
    requestId,
    source,
    path: req?.path || null,
    method: req?.method || null,
    ip: req?.ip || null,
    userAgent: req?.headers?.['user-agent'] || null,
  });

  console.log('[REQUEST_PAIRING_PAYLOAD]', {
    requestId,
    deviceId: input.deviceId || null,
    platform: input.platform,
    engineVersion: input.engineVersion,
    appVersion: input.appVersion,
    deviceModel: input.deviceModel,
    deviceType: input.deviceType,
  });

  try {
    const result = await requestPairing(input, createEngineContext());

    if (result?.alreadyPaired) {
      const sessionId = result.deviceId || result.id;
      console.log('[REQUEST_PAIRING_RESPONSE]', {
        requestId,
        alreadyPaired: true,
        deviceId: sessionId,
      });
      return {
        ok: true,
        alreadyPaired: true,
        sessionId,
        deviceId: sessionId,
        tenantId: result.tenantId,
        storeId: result.storeId,
      };
    }

    const sessionId = result?.id || result?.deviceId || result?.sessionId;
    const code = result?.code || result?.pairingCode || result?.pairCode;
    const expiresAt = result?.expiresAt;

    if (!sessionId || !code || !expiresAt) {
      console.error('[REQUEST_PAIRING_FAILED]', {
        requestId,
        reason: 'invalid_pairing_response',
        hasSessionId: !!sessionId,
        hasCode: !!code,
        hasExpiresAt: !!expiresAt,
      });
      const err = new Error('Missing sessionId or code in pairing result.');
      err.code = 'invalid_pairing_response';
      throw err;
    }

    const response = {
      ok: true,
      sessionId,
      code,
      expiresAt,
      deviceId: sessionId,
    };

    console.log('[REQUEST_PAIRING_RESPONSE]', {
      requestId,
      sessionId,
      code,
      expiresAt,
      deviceId: sessionId,
    });

    try {
      emitPairAlertEvent({
        alertId: `pair-${sessionId}`,
        deviceId: sessionId,
        deviceName: input.deviceModel || `Device ${String(sessionId).slice(0, 8)}`,
        deviceType: input.deviceType || 'screen',
        lastSeen: new Date().toISOString(),
        reason: 'pair_request',
        status: 'pending',
        tenantId: 'temp',
        storeId: 'temp',
        timestamp: new Date().toISOString(),
        code,
        expiresAt,
      });
    } catch (alertError) {
      console.error('[REQUEST_PAIRING_FAILED] pair_alert_emit (non-fatal)', {
        requestId,
        message: alertError?.message,
      });
    }

    return response;
  } catch (error) {
    console.error('[REQUEST_PAIRING_FAILED]', {
      requestId,
      source,
      message: error?.message,
      name: error?.name,
      code: error?.code,
    });
    throw error;
  }
}

/**
 * Map Device row to legacy TV poll status (/api/screens/pair/sessions/:id/status).
 */
export function mapDeviceToLegacyPairStatus(device) {
  if (!device) return null;

  const now = Date.now();
  const expiresAtMs = pairingExpiresAt(device).getTime();
  const ttlLeftMs = pairingTtlLeftMs(device, new Date(now));
  const hasPairingCode = !!device.pairingCode;
  const isTemp = device.tenantId === 'temp' || device.storeId === 'temp';
  const isPaired = !hasPairingCode && !isTemp;

  if (hasPairingCode && ttlLeftMs <= 0) {
    return {
      ok: true,
      sessionId: device.id,
      status: 'expired',
      ttlLeftMs: 0,
      engine: 'DEVICE_V2',
    };
  }

  if (isPaired) {
    return {
      ok: true,
      sessionId: device.id,
      status: 'bound',
      screenId: device.id,
      deviceId: device.id,
      token: device.id,
      ttlLeftMs: 0,
      engine: 'DEVICE_V2',
    };
  }

  if (hasPairingCode) {
    return {
      ok: true,
      sessionId: device.id,
      status: 'showing_code',
      pairingCode: device.pairingCode,
      ttlLeftMs,
      engine: 'DEVICE_V2',
    };
  }

  return {
    ok: true,
    sessionId: device.id,
    status: 'showing_code',
    ttlLeftMs,
    engine: 'DEVICE_V2',
  };
}
