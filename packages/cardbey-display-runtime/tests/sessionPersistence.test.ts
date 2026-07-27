import { describe, expect, it } from 'vitest';
import { createPairedSession } from '../src/identity/deviceSession.js';
import {
  loadValidatedDeviceSession,
  parseStoredDeviceSession,
  persistDeviceSession,
} from '../src/identity/sessionPersistence.js';
import { STORAGE_KEYS } from '../src/storage/displayStorage.js';
import { createMemoryStorage as mem } from '../src/storage/memoryStorage.js';

describe('sessionPersistence', () => {
  it('persists schema-versioned session and loads it', async () => {
    const storage = mem();
    const session = createPairedSession({ deviceId: 'dev-1', storeId: 'store-1' });
    await persistDeviceSession(storage, session);
    const raw = await storage.get<unknown>(STORAGE_KEYS.deviceSession);
    expect(raw).toMatchObject({ schemaVersion: 1, session: { deviceId: 'dev-1' } });
    expect(await loadValidatedDeviceSession(storage)).toMatchObject({
      deviceId: 'dev-1',
      pairingState: 'PAIRED',
      storeId: 'store-1',
    });
  });

  it('rejects null string secrets and malformed sessions', () => {
    expect(
      parseStoredDeviceSession({
        deviceId: 'dev-1',
        pairingState: 'PAIRED',
        deviceSecret: 'null',
      })?.deviceSecret,
    ).toBeUndefined();
    expect(parseStoredDeviceSession({ deviceId: '', pairingState: 'PAIRED' })).toBeNull();
    expect(parseStoredDeviceSession({ foo: 1 })).toBeNull();
  });

  it('clears invalid stored session on load', async () => {
    const storage = mem();
    await storage.set(STORAGE_KEYS.deviceSession, { garbage: true });
    expect(await loadValidatedDeviceSession(storage)).toBeNull();
    expect(await storage.get(STORAGE_KEYS.deviceSession)).toBeNull();
  });
});
