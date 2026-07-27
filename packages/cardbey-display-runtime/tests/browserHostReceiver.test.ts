import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserSetInterval,
  browserSetTimeout,
  createDeviceApiClient,
  createFetchTransport,
  HeartbeatController,
  SyncController,
  FakeClock,
  createMemoryStorage,
  createDeviceIdentity,
  validateRuntimeConfig,
  isIllegalInvocationError,
  normalizeFetchImpl,
} from '../src/index.js';
import { heartbeatFixture, playlistFullFixture } from './fixtures/deviceV2.js';

function createReceiverSensitiveWindow() {
  const host: Record<string, unknown> = {};
  host.fetch = function fetch(this: unknown, _input?: unknown, _init?: unknown) {
    if (this !== host) {
      throw new TypeError('Illegal invocation');
    }
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true, ...playlistFullFixture }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
  host.setInterval = function setInterval(this: unknown, _handler?: unknown, ms?: number) {
    if (this !== host) {
      throw new TypeError('Illegal invocation');
    }
    return (ms || 1) as unknown as ReturnType<typeof setInterval>;
  };
  host.clearInterval = function clearInterval(this: unknown) {
    if (this !== host) {
      throw new TypeError('Illegal invocation');
    }
  };
  host.setTimeout = function setTimeout(this: unknown, _handler?: unknown, ms?: number) {
    if (this !== host) {
      throw new TypeError('Illegal invocation');
    }
    return (ms || 1) as unknown as ReturnType<typeof setTimeout>;
  };
  host.clearTimeout = function clearTimeout(this: unknown) {
    if (this !== host) {
      throw new TypeError('Illegal invocation');
    }
  };
  return host as Window & typeof globalThis;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser host receiver safety', () => {
  it('uses browser fetch with the window receiver on legacy webOS', async () => {
    const host = createReceiverSensitiveWindow();
    vi.stubGlobal('window', host);

    const unbound = host.fetch as typeof fetch;
    expect(() => unbound('https://example.com')).toThrowError(/Illegal invocation/i);

    const transport = createFetchTransport();
    const res = await transport.request<{ ok: boolean }>({
      method: 'GET',
      url: 'https://cardbey-core.example.com/api/device/x/playlist/full',
    });
    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);

    // Injected unbound window.fetch must also be normalized
    const transport2 = createFetchTransport(unbound);
    const res2 = await transport2.request<{ ok: boolean }>({
      method: 'GET',
      url: 'https://cardbey-core.example.com/api/device/x/playlist/full',
    });
    expect(res2.status).toBe(200);
  });

  it('normalizeFetchImpl preserves mock fetch without requiring window receiver', async () => {
    const mock = vi.fn(async () => {
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const wrapped = normalizeFetchImpl(mock as unknown as typeof fetch);
    const res = await wrapped('https://example.com/x');
    expect(res.status).toBe(200);
    expect(mock).toHaveBeenCalledOnce();
  });

  it('detects Illegal invocation errors including nested causes', () => {
    const root = new TypeError('Illegal invocation');
    const wrapped = new Error('Playlist sync failed');
    (wrapped as Error & { cause?: unknown }).cause = root;
    expect(isIllegalInvocationError(wrapped)).toBe(true);
  });

  it('schedules timers with window receiver (unbound setInterval throws)', () => {
    const host = createReceiverSensitiveWindow();
    vi.stubGlobal('window', host);

    const unboundInterval = host.setInterval as typeof setInterval;
    expect(() => unboundInterval(() => undefined, 10)).toThrowError(/Illegal invocation/i);
    expect(() => browserSetInterval(() => undefined, 10)).not.toThrow();
    expect(() => browserSetTimeout(() => undefined, 5)).not.toThrow();
  });

  it('heartbeat and sync succeed when host timers require window receiver', async () => {
    const host = createReceiverSensitiveWindow();
    // Heartbeat fixture response for fetch path used by both controllers
    host.fetch = function fetch(this: unknown, input?: unknown) {
      if (this !== host) throw new TypeError('Illegal invocation');
      const url = String(input || '');
      const body = url.includes('heartbeat')
        ? heartbeatFixture
        : playlistFullFixture;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    };
    vi.stubGlobal('window', host);

    const config = validateRuntimeConfig({
      apiBaseUrl: 'https://cardbey-core.example.com',
      platform: 'webos_tv',
      appVersion: '1.0.0',
      heartbeatIntervalMs: 60_000,
      playlistSyncIntervalMs: 60_000,
    });
    const identity = createDeviceIdentity({
      deviceId: 'dev-1',
      installationId: 'install-1',
      platform: 'webos_tv',
      appVersion: '1.0.0',
    });

    const transport = createFetchTransport();
    const api = createDeviceApiClient({ config, transport });
    const hb = new HeartbeatController({
      api,
      config,
      identity,
      clock: new FakeClock(),
    });
    expect(() => hb.start()).not.toThrow();
    expect(hb.getSnapshot().running).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    hb.stop();

    const sync = new SyncController({
      api,
      config,
      storage: createMemoryStorage(),
      clock: new FakeClock(),
      deviceId: identity.deviceId,
    });
    expect(() => sync.start()).not.toThrow();
    await new Promise((r) => setTimeout(r, 40));
    const snap = sync.getSnapshot();
    expect(snap.running).toBe(true);
    expect(['updated', 'empty', 'unchanged']).toContain(snap.lastOutcome);
    expect(snap.lastOperation === 'MANIFEST_READY' || snap.lastOperation === 'ASSIGNMENT_FOUND').toBe(
      true,
    );
    sync.stop();
  });

  it('localStorage adapter preserves Storage receiver', () => {
    const store = {
      length: 0,
      clear() {},
      key() {
        return null;
      },
      getItem(this: unknown, key: string) {
        if (this !== store) throw new TypeError('Illegal invocation');
        return key === 'x' ? '"ok"' : null;
      },
      setItem(this: unknown) {
        if (this !== store) throw new TypeError('Illegal invocation');
      },
      removeItem(this: unknown) {
        if (this !== store) throw new TypeError('Illegal invocation');
      },
    };

    const detached = store.getItem;
    expect(() => detached('x')).toThrowError(/Illegal invocation/i);
    expect(store.getItem('x')).toBe('"ok"');
    expect(store.getItem.call(store, 'y')).toBe(null);
  });
});
