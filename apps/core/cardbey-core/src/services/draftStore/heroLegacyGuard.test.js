import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  LEGACY_HERO_FIELDS,
  detectLegacyHeroFields,
  warnDirectLegacyHeroWrite,
  guardLegacyHeroWrite,
  assertNoDirectLegacyHeroWrite,
} from './heroLegacyGuard.js';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_STRICT = process.env.HERO_LEGACY_STRICT;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_STRICT === undefined) delete process.env.HERO_LEGACY_STRICT;
  else process.env.HERO_LEGACY_STRICT = ORIGINAL_STRICT;
  vi.restoreAllMocks();
});

describe('heroLegacyGuard', () => {
  it('detects legacy hero fields on a patch', () => {
    const fields = detectLegacyHeroFields({ heroImageUrl: 'x', heroVideoUrl: null, name: 'n' });
    expect(fields).toContain('heroImageUrl');
    expect(fields).toContain('heroVideoUrl');
    expect(fields).not.toContain('name');
  });

  it('exposes the full legacy field list', () => {
    expect(LEGACY_HERO_FIELDS).toContain('heroImageUrl');
    expect(LEGACY_HERO_FIELDS).toContain('heroMediaType');
  });

  it('logs the blocked message in dev (non-strict)', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.HERO_LEGACY_STRICT;
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnDirectLegacyHeroWrite('test.writer', { draftId: 'd1' });
    expect(spy).toHaveBeenCalledWith(
      '[hero-legacy-blocked] direct legacy hero write blocked',
      expect.objectContaining({ source: 'test.writer', draftId: 'd1' }),
    );
  });

  it('is a no-op in production', () => {
    process.env.NODE_ENV = 'production';
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnDirectLegacyHeroWrite('test.writer');
    expect(spy).not.toHaveBeenCalled();
  });

  it('throws in strict mode so tests can fail on direct writes', () => {
    process.env.NODE_ENV = 'test';
    process.env.HERO_LEGACY_STRICT = '1';
    expect(() => warnDirectLegacyHeroWrite('bad.writer')).toThrow(/hero-legacy-blocked/);
  });

  it('canonical writer source is allowed even in strict mode', () => {
    process.env.NODE_ENV = 'test';
    process.env.HERO_LEGACY_STRICT = '1';
    expect(() =>
      guardLegacyHeroWrite('writeCanonicalHeroMediaToPreview', { heroImageUrl: 'x' }),
    ).not.toThrow();
  });

  it('assertNoDirectLegacyHeroWrite restores the flag and surfaces blocked writes', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.HERO_LEGACY_STRICT;
    await expect(
      assertNoDirectLegacyHeroWrite(async () => {
        guardLegacyHeroWrite('legacy.writer', { heroImageUrl: 'x' });
      }),
    ).rejects.toThrow(/hero-legacy-blocked/);
    expect(process.env.HERO_LEGACY_STRICT).toBeUndefined();
  });
});
