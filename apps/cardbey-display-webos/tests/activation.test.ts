import { describe, expect, it, vi } from 'vitest';
import {
  createDeviceApiClient,
  createMemoryStorage,
  createPairedSession,
  createDeviceIdentity,
  validateRuntimeConfig,
  FakeClock,
  STORAGE_KEYS,
  loadValidatedDeviceSession,
} from '@cardbey/display-runtime';
import { SessionActivation } from '../src/runtime/SessionActivation.js';
import { createFixtureTransport } from '../src/runtime/fixtureTransport.js';

const config = validateRuntimeConfig({
  apiBaseUrl: 'https://cardbey-core.example.com',
  platform: 'webos_tv',
  appVersion: '0.1.0',
  heartbeatIntervalMs: 60_000,
  playlistSyncIntervalMs: 60_000,
});

const identity = createDeviceIdentity({
  deviceId: 'fixture-device-1f2d79a8-f321-4377-af7e-c6130d6bf55c',
  installationId: 'install-1',
  platform: 'webos_tv',
  appVersion: '0.1.0',
});

describe('SessionActivation', () => {
  it('starts heartbeat and sync once and is idempotent', async () => {
    const storage = createMemoryStorage();
    const api = createDeviceApiClient({
      config,
      transport: createFixtureTransport('empty_playlist'),
    });
    const activation = new SessionActivation({
      api,
      config,
      storage,
      clock: new FakeClock(),
      identity,
    });
    const session = createPairedSession({ deviceId: identity.deviceId });

    await activation.activatePairedSession(session);
    await activation.activatePairedSession(session);

    expect(activation.isActivatedFor(identity.deviceId)).toBe(true);
    expect(activation.getHeartbeat()?.getSnapshot().running).toBe(true);
    expect(activation.getSync()?.getSnapshot().running).toBe(true);
    expect(await loadValidatedDeviceSession(storage)).toMatchObject({
      deviceId: identity.deviceId,
      pairingState: 'PAIRED',
    });

    await activation.localReset();
    expect(await storage.get(STORAGE_KEYS.deviceSession)).toBeNull();
    expect(await storage.get(STORAGE_KEYS.lastValidManifest)).toBeNull();
    expect(activation.getHeartbeat()).toBeNull();
  });

  it('does not unpair when sync returns empty playlist', async () => {
    const storage = createMemoryStorage();
    const onSync = vi.fn();
    const activation = new SessionActivation({
      api: createDeviceApiClient({
        config,
        transport: createFixtureTransport('empty_playlist'),
      }),
      config,
      storage,
      clock: new FakeClock(),
      identity,
      callbacks: { onSync },
    });
    await activation.activatePairedSession(createPairedSession({ deviceId: identity.deviceId }));
    await new Promise((r) => setTimeout(r, 30));
    expect(await loadValidatedDeviceSession(storage)).toMatchObject({ pairingState: 'PAIRED' });
  });
});
