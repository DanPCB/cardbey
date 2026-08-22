import { describe, expect, it } from 'vitest';
import { createMemoryStorage, STORAGE_KEYS } from '@cardbey/display-runtime';
import {
  ensureDeviceIdentity,
  loadStoredSession,
} from '../src/boot/deviceBootstrap.js';

describe('deviceBootstrap', () => {
  it('creates and persists identity once', async () => {
    const storage = createMemoryStorage();
    const first = await ensureDeviceIdentity({
      storage,
      platform: 'webos_tv',
      appVersion: '0.1.0',
      modelName: 'OLED55',
    });
    const second = await ensureDeviceIdentity({
      storage,
      platform: 'webos_tv',
      appVersion: '0.1.0',
    });
    expect(second.deviceId).toBe(first.deviceId);
    expect(second.installationId).toBe(first.installationId);
    expect(await storage.get(STORAGE_KEYS.deviceIdentity)).toMatchObject({
      deviceId: first.deviceId,
      platform: 'webos_tv',
    });
  });

  it('returns null when no session stored', async () => {
    const storage = createMemoryStorage();
    expect(await loadStoredSession(storage)).toBeNull();
  });
});
