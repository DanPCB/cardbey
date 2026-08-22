import { STORAGE_KEYS, type DisplayStorage } from '../storage/displayStorage.js';
import type { DeviceSession } from './deviceSession.js';

export const DEVICE_SESSION_SCHEMA_VERSION = 1 as const;

export type PersistedDeviceSessionV1 = {
  schemaVersion: typeof DEVICE_SESSION_SCHEMA_VERSION;
  session: DeviceSession;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Reject malformed storage; accept legacy bare DeviceSession without schemaVersion. */
export function parseStoredDeviceSession(raw: unknown): DeviceSession | null {
  if (!raw || typeof raw !== 'object') return null;

  const record = raw as Record<string, unknown>;
  const candidate =
    typeof record.schemaVersion === 'number' && record.session && typeof record.session === 'object'
      ? (record.session as Record<string, unknown>)
      : record;

  if (!isNonEmptyString(candidate.deviceId)) return null;
  if (candidate.pairingState !== 'PAIRED' && candidate.pairingState !== 'PAIRING' && candidate.pairingState !== 'UNPAIRED') {
    return null;
  }

  const secret = candidate.deviceSecret;
  const deviceSecret =
    secret === null || secret === undefined || secret === 'null' || secret === ''
      ? undefined
      : isNonEmptyString(secret)
        ? secret
        : undefined;

  return {
    deviceId: candidate.deviceId.trim(),
    pairingState: candidate.pairingState,
    deviceSecret,
    storeId: isNonEmptyString(candidate.storeId) ? candidate.storeId.trim() : undefined,
    businessId: isNonEmptyString(candidate.businessId) ? candidate.businessId.trim() : undefined,
    tenantId: isNonEmptyString(candidate.tenantId) ? candidate.tenantId.trim() : undefined,
    pairedAt: isNonEmptyString(candidate.pairedAt) ? candidate.pairedAt : undefined,
    sessionId: isNonEmptyString(candidate.sessionId) ? candidate.sessionId.trim() : undefined,
    displayName: isNonEmptyString(candidate.displayName) ? candidate.displayName.trim() : undefined,
  };
}

export async function persistDeviceSession(
  storage: DisplayStorage,
  session: DeviceSession,
): Promise<void> {
  const payload: PersistedDeviceSessionV1 = {
    schemaVersion: DEVICE_SESSION_SCHEMA_VERSION,
    session: {
      ...session,
      deviceSecret:
        session.deviceSecret && session.deviceSecret !== 'null'
          ? session.deviceSecret
          : undefined,
    },
  };
  await storage.set(STORAGE_KEYS.deviceSession, payload);
}

export async function loadValidatedDeviceSession(
  storage: DisplayStorage,
): Promise<DeviceSession | null> {
  const raw = await storage.get<unknown>(STORAGE_KEYS.deviceSession);
  const session = parseStoredDeviceSession(raw);
  if (!session) {
    if (raw != null) await storage.remove(STORAGE_KEYS.deviceSession);
    return null;
  }
  return session;
}

export async function clearDeviceSession(storage: DisplayStorage): Promise<void> {
  await storage.remove(STORAGE_KEYS.deviceSession);
}
