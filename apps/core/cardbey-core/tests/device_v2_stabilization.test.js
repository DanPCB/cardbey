/**
 * Device Engine V2 production stabilization contracts (no live server required).
 */

import { describe, expect, it } from 'vitest';
import { applyAndroidPlaylistFullCompat } from '../src/utils/playlistFullAndroidCompat.js';
import {
  resolvePlaylistItemMediaUrl,
  resolvePlaylistMediaBaseUrl,
} from '../src/lib/deviceProjection.js';

describe('Device V2 stabilization contracts', () => {
  it('playlist/full compat exposes top-level items and ready state', () => {
    const res = applyAndroidPlaylistFullCompat({
      ok: true,
      state: 'no_binding',
      playlist: {
        id: 'pl1',
        name: 'Test',
        items: [
          {
            id: 'i1',
            type: 'video',
            url: '/uploads/media/clip.mp4',
            durationMs: 8000,
          },
        ],
      },
    });
    expect(res.state).toBe('ready');
    expect(res.items).toHaveLength(1);
    expect(res.items[0].mediaUrl).toContain('/uploads/media/clip.mp4');
    expect(res.items[0].durationSeconds).toBeGreaterThan(0);
  });

  it('mediaUrl uses DEVICE_PUBLIC_BASE_URL not loopback', () => {
    const prev = process.env.DEVICE_PUBLIC_BASE_URL;
    process.env.DEVICE_PUBLIC_BASE_URL = 'http://192.168.1.11:3001';
    const out = resolvePlaylistItemMediaUrl(
      'http://127.0.0.1:3001/uploads/media/test.mp4',
      resolvePlaylistMediaBaseUrl(null, {}),
      { itemId: 'i1' },
    );
    expect(out).toBe('http://192.168.1.11:3001/uploads/media/test.mp4');
    process.env.DEVICE_PUBLIC_BASE_URL = prev;
  });

  it('duplicate fingerprint groups same platform/model/store', () => {
    const fp = (d) =>
      `dup:${d.tenantId}|${d.storeId}|${d.type}|${d.platform}|${d.model}`;
    const a = {
      id: 'afa9d39a-804e-4f20-9ba2-876cc38416cc',
      tenantId: 't1',
      storeId: 's1',
      type: 'screen',
      platform: 'android_tv',
      model: 'Falcon',
    };
    const b = {
      id: '28672f3a-2297-42b2-966f-61f6003201ff',
      tenantId: 't1',
      storeId: 's1',
      type: 'screen',
      platform: 'android_tv',
      model: 'Falcon',
    };
    expect(fp(a)).toBe(fp(b));
    expect(a.id).not.toBe(b.id);
  });
});
