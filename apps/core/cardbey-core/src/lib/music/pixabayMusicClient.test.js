import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizePixabayMusicResult,
  buildMusicSearchQuery,
} from './pixabayMusicClient.ts';
import {
  assertPixabayMusicConfigured,
  filterAllowedMusicTracks,
  isPixabayMusicEnabled,
} from './musicLicensePolicy.ts';

describe('pixabayMusicClient', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('normalizes Pixabay audio hit with license and URLs', () => {
    const track = normalizePixabayMusicResult({
      id: 42,
      title: 'Cafe Morning',
      duration: 120,
      tags: 'cafe, acoustic, upbeat',
      pageURL: 'https://pixabay.com/music/cafe-morning-42/',
      user: 'ComposerOne',
      audioURL: 'https://cdn.pixabay.com/audio/42.mp3',
      previewURL: 'https://cdn.pixabay.com/audio/42_preview.mp3',
    });
    expect(track?.provider).toBe('pixabay');
    expect(track?.providerTrackId).toBe('42');
    expect(track?.license).toBe('Pixabay Content License');
    expect(track?.previewUrl).toContain('42');
    expect(track?.downloadUrl).toContain('42');
  });

  it('excludes results without audio URL', () => {
    const track = normalizePixabayMusicResult({
      id: 99,
      title: 'Broken',
      pageURL: 'https://pixabay.com/music/broken/',
    });
    expect(track).toBeNull();
  });

  it('buildMusicSearchQuery maps food vertical', () => {
    expect(buildMusicSearchQuery({ businessVertical: 'food' })).toContain('cafe');
    expect(buildMusicSearchQuery({ businessVertical: 'salon' })).toContain('ambient');
  });

  it('returns disabled when API key missing', () => {
    vi.stubEnv('ENABLE_PIXABAY_MUSIC', 'true');
    delete process.env.PIXABAY_API_KEY;
    const gate = assertPixabayMusicConfigured();
    expect(gate.ok).toBe(false);
    expect(isPixabayMusicEnabled()).toBe(false);
  });

  it('filterAllowedMusicTracks requires license and URL', () => {
    const normalized = normalizePixabayMusicResult({
      id: 1,
      title: 'Ok',
      pageURL: 'https://pixabay.com/music/ok/',
      audioURL: 'https://cdn.example/1.mp3',
    });
    expect(normalized).not.toBeNull();
    const allowed = filterAllowedMusicTracks(normalized ? [normalized] : []);
    expect(allowed).toHaveLength(1);
  });
});
