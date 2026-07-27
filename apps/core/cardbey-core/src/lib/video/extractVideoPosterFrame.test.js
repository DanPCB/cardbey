import { describe, expect, it } from 'vitest';
import { computePosterSeekSeconds } from './extractVideoPosterFrame.js';

describe('computePosterSeekSeconds', () => {
  it('uses frame 0 for clips shorter than 2 seconds', () => {
    expect(computePosterSeekSeconds(0.5)).toBe(0);
    expect(computePosterSeekSeconds(1.9)).toBe(0);
  });

  it('seeks to 1 second for longer clips', () => {
    expect(computePosterSeekSeconds(2)).toBe(1);
    expect(computePosterSeekSeconds(30)).toBe(1);
  });

  it('defaults to 1 second when duration is unknown', () => {
    expect(computePosterSeekSeconds(null)).toBe(1);
    expect(computePosterSeekSeconds(undefined)).toBe(1);
  });
});
