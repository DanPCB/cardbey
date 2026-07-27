import { describe, expect, it } from 'vitest';
import { heroImageUrlForBusinessColumn } from '../draftStore/publishDraftHeroHelpers.js';

describe('publishProjectionHooks hero column', () => {
  it('republish preserves video in heroImageUrl column via poster-first helper', () => {
    const VIDEO = 'https://cdn.example.com/hero.mp4';
    const POSTER = 'https://cdn.example.com/poster.jpg';
    expect(heroImageUrlForBusinessColumn(VIDEO, POSTER)).toBe(POSTER);
    expect(heroImageUrlForBusinessColumn(VIDEO, null)).toBe(VIDEO);
  });
});
