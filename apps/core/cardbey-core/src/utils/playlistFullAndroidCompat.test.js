import { describe, expect, it } from 'vitest';
import {
  applyAndroidPlaylistFullCompat,
  formatApkPlaylistItems,
  isActivePlaylistBindingStatus,
  pickPlaylistBindingForPlayback,
} from './playlistFullAndroidCompat.js';

describe('isActivePlaylistBindingStatus', () => {
  it('accepts ready, pending, active, assigned (case-insensitive)', () => {
    expect(isActivePlaylistBindingStatus('ready')).toBe(true);
    expect(isActivePlaylistBindingStatus('PENDING')).toBe(true);
    expect(isActivePlaylistBindingStatus('active')).toBe(true);
    expect(isActivePlaylistBindingStatus('Assigned')).toBe(true);
    expect(isActivePlaylistBindingStatus('failed')).toBe(false);
  });
});

describe('pickPlaylistBindingForPlayback', () => {
  it('prefers active binding over failed', () => {
    const picked = pickPlaylistBindingForPlayback([
      { id: 'f', status: 'failed', playlistId: 'old', lastPushedAt: '2026-01-02T00:00:00Z' },
      { id: 'a', status: 'ready', playlistId: 'new', lastPushedAt: '2026-01-01T00:00:00Z' },
    ]);
    expect(picked?.id).toBe('a');
  });

  it('falls back to newest failed binding so TV is not empty', () => {
    const picked = pickPlaylistBindingForPlayback([
      { id: 'f1', status: 'failed', playlistId: 'pl1', lastPushedAt: '2026-01-01T00:00:00Z' },
      { id: 'f2', status: 'failed', playlistId: 'pl2', lastPushedAt: '2026-01-03T00:00:00Z' },
    ]);
    expect(picked?.playlistId).toBe('pl2');
  });

  it('ignores cleared bindings', () => {
    const picked = pickPlaylistBindingForPlayback([
      { id: 'c', status: 'cleared', playlistId: 'plx', lastPushedAt: '2026-01-04T00:00:00Z' },
      { id: 'f', status: 'failed', playlistId: 'ply', lastPushedAt: '2026-01-01T00:00:00Z' },
    ]);
    expect(picked?.playlistId).toBe('ply');
  });
});

describe('formatApkPlaylistItems', () => {
  it('adds mediaUrl and durationSeconds aliases', () => {
    const out = formatApkPlaylistItems([
      { id: 'a1', type: 'video', url: 'https://cdn.example/v.mp4', durationMs: 5000, order: 0 },
    ]);
    expect(out[0].mediaUrl).toBe('https://cdn.example/v.mp4');
    expect(out[0].durationSeconds).toBe(5);
  });
});

describe('applyAndroidPlaylistFullCompat', () => {
  it('lifts nested playlist.items to top-level and forces ready when playable', () => {
    const response = {
      ok: true,
      state: 'pending_binding',
      playlist: {
        id: 'pl1',
        name: 'Test',
        items: [{ id: 'i1', type: 'image', url: 'https://x/a.jpg', durationMs: 8000, order: 0 }],
      },
    };
    applyAndroidPlaylistFullCompat(response);
    expect(response.state).toBe('ready');
    expect(response.items).toHaveLength(1);
    expect(response.items[0].mediaUrl).toBe('https://x/a.jpg');
    expect(response.itemCount).toBe(1);
  });

  it('sets empty items array when no playlist', () => {
    const response = { ok: true, state: 'no_binding', playlist: null };
    applyAndroidPlaylistFullCompat(response);
    expect(response.items).toEqual([]);
  });
});
