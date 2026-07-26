import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Features } from '../features.js';

describe('Features.ctaEngine.platformMarketingV1', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
  });

  afterEach(() => {
    process.env = envBackup;
  });

  it('defaults off in production when unset', () => {
    delete process.env.ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1;
    process.env.NODE_ENV = 'production';
    expect(Features.ctaEngine.platformMarketingV1).toBe(false);
  });

  it('defaults on in non-production when unset', () => {
    delete process.env.ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1;
    process.env.NODE_ENV = 'development';
    expect(Features.ctaEngine.platformMarketingV1).toBe(true);
  });

  it('strict boolean parsing', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1 = 'true';
    expect(Features.ctaEngine.platformMarketingV1).toBe(true);
    process.env.ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1 = '1';
    expect(Features.ctaEngine.platformMarketingV1).toBe(true);
    process.env.ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1 = 'false';
    expect(Features.ctaEngine.platformMarketingV1).toBe(false);
    process.env.ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1 = '0';
    expect(Features.ctaEngine.platformMarketingV1).toBe(false);
    // Arbitrary string is not truthy → falls through to production default off
    process.env.ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1 = 'yesplease';
    expect(Features.ctaEngine.platformMarketingV1).toBe(false);
  });
});
