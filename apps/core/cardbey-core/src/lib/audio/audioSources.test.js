import { describe, expect, it } from 'vitest';
import { AUDIO_SOURCES, isAudioSourceEnabled, listAudioSourcesForApi } from './audioSources.js';

describe('audioSources', () => {
  it('lists all configured sources', () => {
    const sources = listAudioSourcesForApi();
    expect(sources.map((s) => s.id)).toEqual(
      expect.arrayContaining(['pixabay', 'openverse', 'freesound', 'jamendo', 'ccmixter', 'local']),
    );
  });

  it('openverse and local are always enabled', () => {
    expect(isAudioSourceEnabled('openverse')).toBe(true);
    expect(isAudioSourceEnabled('local')).toBe(true);
  });

  it('exposes registry metadata', () => {
    expect(AUDIO_SOURCES.jamendo.apiUrl).toContain('jamendo.com');
    expect(AUDIO_SOURCES.freesound.openverseSource).toBe('freesound');
  });
});
