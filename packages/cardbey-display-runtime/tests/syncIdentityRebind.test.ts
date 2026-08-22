import { describe, expect, it, vi } from 'vitest';
import { SyncController } from '../src/sync/syncController.js';
import { SystemClock } from '../src/platform/clock.js';
import { createMemoryStorage } from '../src/storage/memoryStorage.js';
import { defaultRuntimeConfig } from '../src/config/runtimeConfig.js';
import type { DeviceApiClient } from '../src/api/deviceApiClient.js';

function makeApi(impl: Partial<DeviceApiClient>): DeviceApiClient {
  return {
    requestPairing: vi.fn(),
    pollPairingStatus: vi.fn(),
    completePairing: vi.fn(),
    sendHeartbeat: vi.fn(),
    fetchFullPlaylist: vi.fn(),
    ...impl,
  } as DeviceApiClient;
}

describe('SyncController identity rebind', () => {
  it('switches playlist/full target after setDeviceId', async () => {
    const fetchFullPlaylist = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        deviceId: 'stale',
        state: 'no_binding',
        items: [],
        playlist: null,
      })
      .mockResolvedValueOnce({
        ok: true,
        deviceId: 'canonical',
        state: 'ready',
        items: [
          {
            id: 'i1',
            type: 'image',
            url: 'https://cdn.example.com/a.jpg',
            durationMs: 5000,
            order: 0,
          },
        ],
        playlist: {
          id: 'pl1',
          name: 'V01',
          items: [
            {
              id: 'i1',
              type: 'image',
              url: 'https://cdn.example.com/a.jpg',
              durationMs: 5000,
              order: 0,
            },
          ],
        },
      });

    const sync = new SyncController({
      api: makeApi({ fetchFullPlaylist }),
      config: defaultRuntimeConfig({
        apiBaseUrl: 'https://cardbey-core-staging.onrender.com',
        platform: 'webos_tv',
        appVersion: '0.1.0',
      }),
      storage: createMemoryStorage(),
      clock: new SystemClock(),
      deviceId: 'stale',
      setIntervalFn: (() => 1) as unknown as typeof setInterval,
      clearIntervalFn: (() => undefined) as unknown as typeof clearInterval,
    });

    const empty = await sync.syncNow();
    expect(empty.kind).toBe('empty');
    expect(empty).toMatchObject({ contentCode: 'NOT_ASSIGNED' });

    sync.setDeviceId('canonical');
    const updated = await sync.syncNow();
    expect(fetchFullPlaylist).toHaveBeenNthCalledWith(2, 'canonical', expect.anything());
    expect(updated.kind).toBe('updated');
    if (updated.kind === 'updated') {
      expect(updated.manifest.playlist.items).toHaveLength(1);
    }
  });
});
