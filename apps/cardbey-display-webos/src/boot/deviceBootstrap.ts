import {
  STORAGE_KEYS,
  createDeviceIdentity,
  createId,
  type DeviceIdentity,
  type DeviceSession,
  type DisplayStorage,
} from '@cardbey/display-runtime';

export async function ensureDeviceIdentity(input: {
  storage: DisplayStorage;
  platform: string;
  appVersion: string;
  modelName?: string;
  platformVersion?: string;
}): Promise<DeviceIdentity> {
  const existing = await input.storage.get<DeviceIdentity>(STORAGE_KEYS.deviceIdentity);
  if (existing?.deviceId && existing?.installationId) {
    return createDeviceIdentity({
      ...existing,
      platform: input.platform,
      appVersion: input.appVersion,
      modelName: input.modelName ?? existing.modelName,
      platformVersion: input.platformVersion ?? existing.platformVersion,
    });
  }

  const identity = createDeviceIdentity({
    deviceId: createId(),
    installationId: createId(),
    platform: input.platform,
    appVersion: input.appVersion,
    modelName: input.modelName,
    platformVersion: input.platformVersion,
  });
  await input.storage.set(STORAGE_KEYS.deviceIdentity, identity);
  return identity;
}

export async function loadStoredSession(
  storage: DisplayStorage,
): Promise<DeviceSession | null> {
  const session = await storage.get<DeviceSession>(STORAGE_KEYS.deviceSession);
  if (!session?.deviceId) return null;
  return session;
}
