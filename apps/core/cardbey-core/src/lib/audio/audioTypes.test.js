import { describe, expect, it } from 'vitest';
import {
  buildAudioExternalId,
  isAllowedAudioTrack,
  mapOpenverseProviderToSource,
  musicTrackToAudioTrack,
} from './audioTypes.js';

describe('audioTypes', () => {
  it('buildAudioExternalId composes source and id', () => {
    expect(buildAudioExternalId('jamendo', '42')).toBe('jamendo_42');
  });

  it('mapOpenverseProviderToSource maps upstream providers', () => {
    expect(mapOpenverseProviderToSource('jamendo')).toBe('jamendo');
    expect(mapOpenverseProviderToSource('freesound')).toBe('freesound');
    expect(mapOpenverseProviderToSource('wikimedia')).toBe('openverse');
  });

  it('musicTrackToAudioTrack preserves license fields', () => {
    const track = musicTrackToAudioTrack(
      {
        provider: 'openverse',
        providerTrackId: 'abc-123',
        title: 'Cafe Chill',
        duration: 120,
        genre: null,
        mood: null,
        tags: ['cafe'],
        previewUrl: 'https://example.com/a.mp3',
        downloadUrl: 'https://example.com/a.mp3',
        attribution: 'Artist',
        license: 'CC BY 4.0',
        sourceUrl: 'https://example.com/track',
        thumbnailUrl: null,
        metadata: { openverse: { provider: 'jamendo' } },
      },
      'jamendo',
    );
    expect(track.id).toBe('jamendo_abc-123');
    expect(track.source).toBe('jamendo');
    expect(isAllowedAudioTrack(track)).toBe(true);
  });
});
