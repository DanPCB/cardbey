import { describe, expect, it, beforeEach } from 'vitest';
import {
  createMockSocialPublishingProvider,
  resetMockPublishingStore,
} from '../publishing/MockSocialPublishingProvider.js';
import { createMetaFacebookPageProvider } from '../publishing/MetaFacebookPageProvider.js';
import { PROVIDER_CODES } from '../publishing/SocialPublishingProvider.js';

describe('marketingOperator/publishing providers', () => {
  beforeEach(() => {
    resetMockPublishingStore();
    delete process.env.ENABLE_FACEBOOK_LIVE_PUBLISHING_V1;
    delete process.env.ENABLE_FACEBOOK_MARKETING_PROVIDER_V1;
  });

  it('mock provider is idempotent by key', async () => {
    const provider = createMockSocialPublishingProvider({ mode: 'success' });
    const a = await provider.publish({ contentId: 'c1', body: 'hi', idempotencyKey: 'k1' });
    const b = await provider.publish({ contentId: 'c1', body: 'hi', idempotencyKey: 'k1' });
    expect(a.ok).toBe(true);
    expect(b.code).toBe(PROVIDER_CODES.IDEMPOTENT);
    expect(b.externalPostId).toBe(a.externalPostId);
  });

  it('live publishing disabled returns LIVE_DISABLED / CONFIG_REQUIRED', async () => {
    process.env.ENABLE_FACEBOOK_MARKETING_PROVIDER_V1 = 'true';
    process.env.ENABLE_FACEBOOK_LIVE_PUBLISHING_V1 = 'false';
    const provider = createMetaFacebookPageProvider();
    const result = await provider.publish({
      contentId: 'c1',
      body: 'x',
      idempotencyKey: 'live1',
      pageId: '123',
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(PROVIDER_CODES.LIVE_DISABLED);
    expect(JSON.stringify(result)).not.toMatch(/EA[A-Za-z0-9]{10,}/);
  });
});
