import { describe, expect, it } from 'vitest';
import { isLogoCheckpointDeferredRespond } from './missionLogoCheckpointRespond.js';

describe('missionLogoCheckpointRespond', () => {
  it('defers Upload now without logoUrl', () => {
    expect(isLogoCheckpointDeferredRespond('logoChoice', 'Upload now', {})).toBe(true);
    expect(isLogoCheckpointDeferredRespond('logoChoice', 'Upload now', { logoUrl: '' })).toBe(true);
  });

  it('defers Choose from library without logoUrl', () => {
    expect(isLogoCheckpointDeferredRespond('logoChoice', 'Choose from library', {})).toBe(true);
  });

  it('allows Upload now with logoUrl', () => {
    expect(
      isLogoCheckpointDeferredRespond('logoChoice', 'Upload now', {
        logoUrl: 'https://cdn.example/logo.png',
      }),
    ).toBe(false);
  });

  it('allows Skip without logoUrl', () => {
    expect(isLogoCheckpointDeferredRespond('logoChoice', 'Skip', {})).toBe(false);
  });

  it('defers hero image upload without artifact (generalized authority)', () => {
    expect(isLogoCheckpointDeferredRespond('heroImageChoice', 'Upload now', {})).toBe(true);
    expect(isLogoCheckpointDeferredRespond('launchDecision', 'Launch now', {})).toBe(false);
  });
});
