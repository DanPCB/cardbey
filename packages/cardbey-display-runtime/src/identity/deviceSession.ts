/**
 * Device session for Display runtime.
 *
 * SECURITY: Device Engine V2 does not currently issue a revocable device-scoped token.
 * `deviceSecret` is optional and usually undefined. Possession of `deviceId` is enough
 * to call playlist/full and heartbeat today. See docs/cardbey-display/device-v2-contract-map.md.
 */
export type DevicePairingState = 'UNPAIRED' | 'PAIRING' | 'PAIRED';

export type DeviceSession = {
  deviceId: string;
  pairingState: DevicePairingState;
  /** Future / rare: bearer secret. Do not log. */
  deviceSecret?: string;
  storeId?: string;
  businessId?: string;
  tenantId?: string;
  pairedAt?: string;
  sessionId?: string;
  displayName?: string;
};

export function createUnpairedSession(deviceId: string): DeviceSession {
  return { deviceId, pairingState: 'UNPAIRED', sessionId: deviceId };
}

export function createPairedSession(input: {
  deviceId: string;
  storeId?: string;
  tenantId?: string;
  businessId?: string;
  deviceSecret?: string;
  displayName?: string;
  pairedAt?: string;
}): DeviceSession {
  return {
    deviceId: input.deviceId,
    pairingState: 'PAIRED',
    sessionId: input.deviceId,
    storeId: input.storeId,
    tenantId: input.tenantId,
    businessId: input.businessId ?? input.tenantId,
    deviceSecret: input.deviceSecret,
    displayName: input.displayName,
    pairedAt: input.pairedAt ?? new Date().toISOString(),
  };
}
