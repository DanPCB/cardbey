import { describe, expect, it } from 'vitest';
import { normalizePlaylist } from '../src/playlist/normalizePlaylist.js';
import { validateManifest } from '../src/playlist/validateManifest.js';
import {
  playlistEmptyFixture,
  playlistFullFixture,
} from './fixtures/deviceV2.js';

describe('normalizePlaylist', () => {
  it('normalises a real playlist/full fixture', () => {
    const result = normalizePlaylist(playlistFullFixture, {
      apiBaseUrl: 'https://cardbey-core.example.com',
    });
    expect(result.kind).toBe('manifest');
    if (result.kind !== 'manifest') return;
    const manifest = validateManifest(result.manifest);
    expect(manifest.playlist.items).toHaveLength(2);
    expect(manifest.playlist.items[0].id).toBe('item-a');
    expect(manifest.playlist.items[1].url).toContain('sig=abc');
    expect(manifest.settings.orientation).toBe('PORTRAIT');
    expect(manifest.revision).toBe('playlist-1:1');
  });

  it('returns empty for valid empty playlist', () => {
    const result = normalizePlaylist(playlistEmptyFixture, {
      apiBaseUrl: 'https://cardbey-core.example.com',
    });
    expect(result.kind).toBe('empty');
  });

  it('rejects ok=false without items', () => {
    expect(() =>
      normalizePlaylist(
        { ok: false, error: 'device_not_found', message: 'missing' },
        { apiBaseUrl: 'https://cardbey-core.example.com' },
      ),
    ).toThrow(/ok=false|missing/i);
  });

  it('handles missing optional fields and relative URLs', () => {
    const result = normalizePlaylist(
      {
        ok: true,
        state: 'ready',
        items: [{ url: '/uploads/x.jpg', type: 'image' }],
      },
      { apiBaseUrl: 'https://cardbey-core.example.com' },
    );
    expect(result.kind).toBe('manifest');
    if (result.kind !== 'manifest') return;
    expect(result.manifest.playlist.items[0].url).toBe(
      'https://cardbey-core.example.com/uploads/x.jpg',
    );
  });

  it('classifies HLS live_hls and m3u8 as VIDEO, not IMAGE', () => {
    const result = normalizePlaylist(
      {
        ok: true,
        items: [
          {
            id: 'live',
            type: 'live_hls',
            url: 'https://customer-abc.cloudflarestream.com/uid/manifest/video.m3u8',
            mimeType: 'application/vnd.apple.mpegurl',
            qrValue: 'https://app.example/api/public/live-cnet/h/glt_x',
            overlayBadge: 'LIVE NOW',
          },
        ],
      },
      { apiBaseUrl: 'https://cardbey-core.example.com' },
    );
    expect(result.kind).toBe('manifest');
    if (result.kind !== 'manifest') return;
    expect(result.manifest.playlist.items[0].type).toBe('VIDEO');
    expect(result.manifest.playlist.items[0].qrValue).toContain('/live-cnet/h/');
  });

  it('keeps live_card as LIVE_CARD rather than mislabeling HLS', () => {
    const result = normalizePlaylist(
      {
        ok: true,
        items: [
          {
            id: 'card',
            type: 'live_card',
            url: 'https://app.example/s/demo#live',
            overlayTitle: 'Lunch special',
            overlayBadge: 'Live soon',
            qrValue: 'https://app.example/api/public/live-cnet/h/glt_x',
          },
        ],
      },
      { apiBaseUrl: 'https://cardbey-core.example.com' },
    );
    expect(result.kind).toBe('manifest');
    if (result.kind !== 'manifest') return;
    expect(result.manifest.playlist.items[0].type).toBe('LIVE_CARD');
  });

  it('skips unsupported schemes without failing whole playlist', () => {
    const result = normalizePlaylist(
      {
        ok: true,
        playlist: {
          id: 'p1',
          items: [
            { id: 'bad', url: 'javascript:alert(1)' },
            { id: 'good', url: 'https://cdn.example.com/ok.jpg', durationMs: 3000 },
          ],
        },
      },
      { apiBaseUrl: 'https://cardbey-core.example.com' },
    );
    expect(result.kind).toBe('manifest');
    if (result.kind !== 'manifest') return;
    expect(result.manifest.playlist.items).toHaveLength(1);
    expect(result.manifest.playlist.items[0].id).toBe('good');
  });
});
