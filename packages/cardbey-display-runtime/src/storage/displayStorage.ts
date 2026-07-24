export interface DisplayStorage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export const STORAGE_KEYS = {
  deviceIdentity: 'cardbey.display.deviceIdentity',
  deviceSession: 'cardbey.display.deviceSession',
  lastValidManifest: 'cardbey.display.lastValidManifest',
  runtimeSettings: 'cardbey.display.runtimeSettings',
  telemetryQueue: 'cardbey.display.telemetryQueue',
} as const;
