import { describe, it, expect } from 'vitest';
import { detectPosterIntent, detectPosterEditIntent } from '../intakeSystemShortcuts.js';

describe('detectPosterIntent', () => {
  it('matches promotional poster phrases when store is active', () => {
    const hit = detectPosterIntent('Create a promotional poster for my store', 'store-1');
    expect(hit?.tool).toBe('generate_poster');
    expect(hit?.params.storeId).toBe('store-1');
    expect(hit?.params.posterType).toBe('promotional');
  });

  it('returns null without active store', () => {
    expect(detectPosterIntent('make a poster', null)).toBeNull();
  });

  it('detects story poster type', () => {
    const hit = detectPosterIntent('make an instagram story post', 'store-1');
    expect(hit?.params.posterType).toBe('story');
  });
});

describe('detectPosterEditIntent', () => {
  it('matches title edit when poster context exists', () => {
    const hit = detectPosterEditIntent('change the title to MC Hair Salon', true);
    expect(hit?.tool).toBe('mutate_poster');
    expect(hit?.params.instruction).toContain('MC Hair Salon');
  });

  it('returns null without poster context', () => {
    expect(detectPosterEditIntent('change the title', false)).toBeNull();
  });
});
