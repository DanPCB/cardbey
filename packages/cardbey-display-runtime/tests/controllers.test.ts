import { describe, expect, it, vi } from 'vitest';
import { createDeviceApiClient } from '../src/api/deviceApiClient.js';
import { validateRuntimeConfig } from '../src/config/configValidation.js';
import { HeartbeatController } from '../src/heartbeat/heartbeatController.js';
import { createDeviceIdentity } from '../src/identity/deviceIdentity.js';
import { PairingController } from '../src/pairing/pairingController.js';
import { FakeClock } from '../src/platform/clock.js';
import { createMemoryStorage } from '../src/storage/memoryStorage.js';
import { STORAGE_KEYS } from '../src/storage/displayStorage.js';
import { SyncController } from '../src/sync/syncController.js';
import { TelemetryQueue } from '../src/telemetry/telemetryQueue.js';
import { nullTelemetrySink } from '../src/telemetry/nullTelemetrySink.js';
import {
  heartbeatFixture,
  pairCompleteNullTokenFixture,
  pairingStartFixture,
  pairStatusClaimedFixture,
  pairStatusPendingFixture,
  pairStatusUnknownFixture,
  playlistFullFixture,
} from './fixtures/deviceV2.js';
import { createFakeTransport } from './helpers/fakeTransport.js';
import { loadValidatedDeviceSession } from '../src/identity/sessionPersistence.js';

const config = validateRuntimeConfig({
  apiBaseUrl: 'https://cardbey-core.example.com',
  platform: 'webos_tv',
  appVersion: '1.0.0',
  pairingPollIntervalMs: 200,
  heartbeatIntervalMs: 1000,
  playlistSyncIntervalMs: 1000,
});

const identity = createDeviceIdentity({
  deviceId: '1f2d79a8-f321-4377-af7e-c6130d6bf55c',
  installationId: 'install-1',
  platform: 'webos_tv',
  appVersion: '1.0.0',
});

describe('PairingController', () => {
  it('completes successful pairing and persists session', async () => {
    let statusCalls = 0;
    const transport = createFakeTransport([
      {
        match: (r) => r.method === 'POST' && r.url.includes('/request-pairing'),
        response: { status: 200, headers: {}, data: pairingStartFixture },
      },
      {
        match: (r) => r.method === 'GET' && r.url.includes('/pair-status/'),
        response: () => {
          statusCalls += 1;
          return {
            status: 200,
            headers: {},
            data: statusCalls === 1 ? pairStatusPendingFixture : pairStatusClaimedFixture,
          };
        },
      },
      {
        match: (r) => r.method === 'POST' && r.url.includes('/pair-complete'),
        response: {
          status: 200,
          headers: {},
          data: pairCompleteNullTokenFixture,
        },
      },
    ]);
    const api = createDeviceApiClient({ config, transport });
    const storage = createMemoryStorage();
    const snapshots: string[] = [];
    const controller = new PairingController({
      api,
      config,
      identity,
      storage,
      clock: new FakeClock(),
      sleep: async () => undefined,
      onChange: (s) => snapshots.push(s.status),
    });

    const session = await controller.start();
    expect(session?.pairingState).toBe('PAIRED');
    expect(controller.getSnapshot().code).toBeUndefined();
    expect(await loadValidatedDeviceSession(storage)).toMatchObject({
      deviceId: identity.deviceId,
      pairingState: 'PAIRED',
    });
    expect(snapshots).toContain('completing');
    expect(snapshots).toContain('polling');
    // Preserve backend code casing while waiting
    expect(controller.getSnapshot().status).toBe('approved');
  });

  it('preserves pairing code case and rejects pair-complete failure', async () => {
    const storage = createMemoryStorage();
    const transport = createFakeTransport([
      {
        match: (r) => r.method === 'POST' && r.url.includes('/request-pairing'),
        response: { status: 200, headers: {}, data: pairingStartFixture },
      },
      {
        match: (r) => r.method === 'GET' && r.url.includes('/pair-status/'),
        response: { status: 200, headers: {}, data: pairStatusClaimedFixture },
      },
      {
        match: (r) => r.method === 'POST' && r.url.includes('/pair-complete'),
        response: {
          status: 500,
          headers: {},
          data: { ok: false, error: 'pairing_failed' },
        },
      },
    ]);
    const controller = new PairingController({
      api: createDeviceApiClient({ config, transport }),
      config,
      identity,
      storage,
      clock: new FakeClock(),
      sleep: async () => undefined,
      onChange: (s) => {
        if (s.status === 'polling' && s.code) {
          expect(s.code).toBe('Ab12Cd');
        }
      },
    });
    await expect(controller.start()).rejects.toBeTruthy();
    expect(await storage.get(STORAGE_KEYS.deviceSession)).toBeNull();
  });

  it('fails on unknown pair-status', async () => {
    const transport = createFakeTransport([
      {
        match: (r) => r.url.includes('/request-pairing'),
        response: { status: 200, headers: {}, data: pairingStartFixture },
      },
      {
        match: (r) => r.url.includes('/pair-status/'),
        response: { status: 200, headers: {}, data: pairStatusUnknownFixture },
      },
    ]);
    const controller = new PairingController({
      api: createDeviceApiClient({ config, transport }),
      config,
      identity,
      storage: createMemoryStorage(),
      clock: new FakeClock(),
      sleep: async () => undefined,
    });
    await expect(controller.start()).rejects.toMatchObject({ code: 'DISPLAY_RESPONSE_INVALID' });
  });

  it('expires and cancels without overlapping loops', async () => {
    const transport = createFakeTransport([
      {
        match: (r) => r.url.includes('/request-pairing'),
        response: { status: 200, headers: {}, data: pairingStartFixture },
      },
      {
        match: (r) => r.url.includes('/pair-status/'),
        response: {
          status: 200,
          headers: {},
          data: { ok: true, status: 'expired', ttlLeftMs: 0 },
        },
      },
    ]);
    const api = createDeviceApiClient({ config, transport });
    const controller = new PairingController({
      api,
      config,
      identity,
      storage: createMemoryStorage(),
      clock: new FakeClock(),
      sleep: async () => undefined,
    });
    await expect(controller.start()).rejects.toMatchObject({ code: 'DISPLAY_PAIRING_EXPIRED' });

    const c2 = new PairingController({
      api,
      config,
      identity,
      storage: createMemoryStorage(),
      clock: new FakeClock(),
      sleep: async () => undefined,
    });
    const p = c2.start();
    c2.cancel();
    await expect(p).resolves.toBeNull();
  });
});

describe('HeartbeatController', () => {
  it('starts/stops without overlapping requests', async () => {
    let inFlightMax = 0;
    let current = 0;
    const transport = createFakeTransport([
      {
        match: (r) => r.url.includes('/heartbeat'),
        response: async () => {
          current += 1;
          inFlightMax = Math.max(inFlightMax, current);
          await new Promise((r) => setTimeout(r, 30));
          current -= 1;
          return { status: 200, headers: {}, data: heartbeatFixture };
        },
      },
    ]);
    const api = createDeviceApiClient({ config, transport });
    const timers: Array<ReturnType<typeof setInterval>> = [];
    const controller = new HeartbeatController({
      api,
      config,
      identity,
      clock: new FakeClock(),
      setIntervalFn: ((fn: TimerHandler, ms?: number) => {
        const id = setInterval(fn, ms);
        timers.push(id);
        return id;
      }) as typeof setInterval,
      clearIntervalFn: clearInterval,
    });
    controller.updatePlaybackContext({ playlistId: 'p1', isPlaying: true, state: 'PLAYING' });
    controller.start();
    controller.start(); // no duplicate timer effect on in-flight
    await new Promise((r) => setTimeout(r, 80));
    controller.stop();
    for (const t of timers) clearInterval(t);
    expect(inFlightMax).toBe(1);
    expect(controller.getSnapshot().lastSuccessAt).toBeTruthy();
  });
});

describe('SyncController', () => {
  it('syncs, detects unchanged revision, preserves prior on invalid', async () => {
    let call = 0;
    const transport = createFakeTransport([
      {
        match: (r) => r.url.includes('/playlist/full'),
        response: () => {
          call += 1;
          if (call === 3) {
            return {
              status: 200,
              headers: {},
              data: { ok: false, error: 'bad', message: 'bad playlist' },
            };
          }
          return { status: 200, headers: {}, data: playlistFullFixture };
        },
      },
    ]);
    const api = createDeviceApiClient({ config, transport });
    const storage = createMemoryStorage();
    const controller = new SyncController({
      api,
      config,
      storage,
      clock: new FakeClock(),
      deviceId: identity.deviceId,
      sleep: async () => undefined,
    });

    const first = await controller.syncNow();
    expect(first.kind).toBe('updated');
    const second = await controller.syncNow();
    expect(second.kind).toBe('unchanged');
    const third = await controller.syncNow();
    expect(third.kind).toBe('rejected');
    if (third.kind === 'rejected') {
      expect(third.preserved?.playlist.id).toBe('playlist-1');
    }
  });

  it('marks offline on network error and restores cache', async () => {
    const transport = createFakeTransport([
      {
        match: () => true,
        response: async () => {
          throw new Error('network down');
        },
      },
    ]);
    const api = createDeviceApiClient({ config, transport });
    const storage = createMemoryStorage();
    await storage.set(STORAGE_KEYS.lastValidManifest, {
      id: 'p1',
      revision: 1,
      playlist: {
        id: 'p1',
        loop: true,
        defaultDurationMs: 8000,
        items: [
          { id: 'a', type: 'IMAGE', url: 'https://cdn.example.com/a.jpg', durationMs: 1000 },
        ],
      },
      settings: { muted: true, transition: 'NONE', transitionDurationMs: 0, fit: 'COVER' },
    });
    const controller = new SyncController({
      api,
      config,
      storage,
      clock: new FakeClock(),
      deviceId: identity.deviceId,
      sleep: async () => undefined,
    });
    const cached = await controller.restoreCachedManifest();
    expect(cached?.id).toBe('p1');
    const outcome = await controller.syncNow();
    expect(outcome.kind).toBe('network');
    expect(controller.getSnapshot().offline).toBe(true);
  });
});

describe('storage and telemetry', () => {
  it('storage round trip and missing key', async () => {
    const storage = createMemoryStorage();
    expect(await storage.get('missing')).toBeNull();
    await storage.set('k', { a: 1 });
    expect(await storage.get('k')).toEqual({ a: 1 });
    await storage.remove('k');
    expect(await storage.get('k')).toBeNull();
  });

  it('bounds telemetry queue with drop_oldest', async () => {
    const sink = { send: vi.fn(async () => undefined) };
    const q = new TelemetryQueue({
      sink,
      clock: new FakeClock(),
      maxQueueSize: 2,
      overflow: 'drop_oldest',
    });
    q.enqueue('APP_STARTED');
    q.enqueue('PAIRING_STARTED');
    q.enqueue('PAIRING_COMPLETED');
    expect(q.size()).toBe(2);
    expect(q.peek()[0].type).toBe('PAIRING_STARTED');
    await q.flush();
    expect(sink.send).toHaveBeenCalled();
    expect(q.size()).toBe(0);
    await nullTelemetrySink.send([]);
  });
});
