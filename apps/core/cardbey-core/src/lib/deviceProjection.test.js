import { describe, expect, it } from 'vitest';
import {
  derivePairingStatus,
  pickActivePlaylistBinding,
  resolveCoreUrlFromHeartbeat,
  resolvePlaylistMediaBaseUrl,
  resolvePlaylistItemMediaUrl,
} from './deviceProjection.js';

describe('deviceProjection', () => {
  it('resolvePlaylistMediaBaseUrl prefers DEVICE_PUBLIC_BASE_URL', () => {
    const prev = process.env.DEVICE_PUBLIC_BASE_URL;
    process.env.DEVICE_PUBLIC_BASE_URL = 'http://192.168.1.11:3001';
    expect(resolvePlaylistMediaBaseUrl(null, { coreUrl: 'http://192.168.1.8:3001' })).toBe(
      'http://192.168.1.11:3001',
    );
    process.env.DEVICE_PUBLIC_BASE_URL = prev;
  });

  it('resolvePlaylistItemMediaUrl strips loopback origin', () => {
    const out = resolvePlaylistItemMediaUrl(
      'http://127.0.0.1:3001/uploads/media/test.mp4',
      'http://192.168.1.11:3001',
      { itemId: 'i1' },
    );
    expect(out).toBe('http://192.168.1.11:3001/uploads/media/test.mp4');
  });

  it('resolveCoreUrlFromHeartbeat prefers body.coreUrl', () => {
    expect(
      resolveCoreUrlFromHeartbeat({ coreUrl: 'http://192.168.1.11:3001' }, null),
    ).toBe('http://192.168.1.11:3001');
  });

  it('pickActivePlaylistBinding skips failed bindings', () => {
    const picked = pickActivePlaylistBinding([
      { playlistId: 'a', status: 'failed', lastPushedAt: new Date('2026-01-02') },
      { playlistId: 'b', status: 'pending', lastPushedAt: new Date('2026-01-01') },
    ]);
    expect(picked?.playlistId).toBe('b');
  });

  it('derivePairingStatus returns paired when tenant/store set', () => {
    expect(
      derivePairingStatus({
        tenantId: 't1',
        storeId: 's1',
        pairingCode: null,
      }),
    ).toBe('paired');
  });
});
