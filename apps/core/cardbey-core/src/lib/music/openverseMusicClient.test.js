import { describe, expect, it } from 'vitest';
import { normalizeOpenverseMusicResult } from './openverseMusicClient.ts';
import { filterAllowedMusicTracks } from './musicLicensePolicy.ts';

describe('openverseMusicClient', () => {
  it('normalizes Openverse audio hit with license and stream URL', () => {
    const track = normalizeOpenverseMusicResult({
      id: '7c107f67-c00b-4a99-b7b7-38efdbfebe70',
      title: 'Upbeat Cafe Chill',
      duration: 161000,
      url: 'https://prod-1.storage.jamendo.com/?trackid=2186724&format=mp32',
      foreign_landing_url: 'https://www.jamendo.com/track/2186724',
      attribution: '"Upbeat Cafe Chill" by AudioJam is licensed under CC BY-NC-ND 3.0.',
      license: 'by-nc-nd',
      license_version: '3.0',
      provider: 'jamendo',
      tags: [{ name: 'uplifting' }],
    });

    expect(track?.provider).toBe('openverse');
    expect(track?.providerTrackId).toBe('7c107f67-c00b-4a99-b7b7-38efdbfebe70');
    expect(track?.downloadUrl).toContain('jamendo.com');
    expect(track?.license).toContain('CC');
    expect(filterAllowedMusicTracks(track ? [track] : [])).toHaveLength(1);
  });

  it('excludes results without stream URL', () => {
    expect(
      normalizeOpenverseMusicResult({
        id: 'missing-url',
        title: 'Broken',
        foreign_landing_url: 'https://example.com/track',
      }),
    ).toBeNull();
  });
});
