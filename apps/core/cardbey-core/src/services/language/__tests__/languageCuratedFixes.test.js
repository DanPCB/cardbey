import { describe, it, expect } from 'vitest';
import { lookupCuratedFix } from '../languageCuratedFixes.js';

describe('languageCuratedFixes', () => {
  it('returns high-confidence fix for nav video studio', () => {
    const fix = lookupCuratedFix('translation.nav.chat-video-studio');
    expect(fix?.fixed).toBe('Video Studio');
    expect(fix?.confidence).toBeGreaterThan(0.9);
  });

  it('returns null for unknown keys', () => {
    expect(lookupCuratedFix('translation.unknown.key')).toBeNull();
  });
});
