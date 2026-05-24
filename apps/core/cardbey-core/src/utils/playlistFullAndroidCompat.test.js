import { describe, expect, it } from 'vitest';
import {
  applyAndroidPlaylistFullCompat,
  formatApkPlaylistItems,
  isActivePlaylistBindingStatus,
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
