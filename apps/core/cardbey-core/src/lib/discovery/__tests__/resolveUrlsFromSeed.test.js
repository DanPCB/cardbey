import { describe, expect, it, vi } from 'vitest';

vi.mock('../sources/tiktokHashtagResolver.js', () => ({
  resolveTikTokHashtag: vi.fn(async () => ({
    urls: [],
    status: 'PROVIDER_BLOCKED',
    tag: 'bakery',
    tagUrl: 'https://www.tiktok.com/tag/bakery',
    httpStatus: 200,
    contentType: 'text/html',
    responseBytes: 100,
    classification: 'BOT_SHELL',
    detail: 'tiktok_hashtag_provider_blocked',
  })),
}));

import { resolveUrlsFromSeed } from '../DiscoveryBatchRunner.js';
import { resolveTikTokHashtag } from '../sources/tiktokHashtagResolver.js';

describe('resolveUrlsFromSeed', () => {
  it('url_list returns candidates without network', async () => {
    const r = await resolveUrlsFromSeed(
      {
        type: 'url_list',
        value: JSON.stringify(['https://www.tiktok.com/@demo.bakery']),
      },
      5,
    );
    expect(r.resolveStatus).toBe('OK');
    expect(r.urls).toEqual(['https://www.tiktok.com/@demo.bakery']);
  });

  it('tiktok_hashtag surfaces PROVIDER_BLOCKED from resolver', async () => {
    const r = await resolveUrlsFromSeed({ type: 'tiktok_hashtag', value: 'bakery' }, 5);
    expect(resolveTikTokHashtag).toHaveBeenCalled();
    expect(r.resolveStatus).toBe('PROVIDER_BLOCKED');
    expect(r.urls).toEqual([]);
    expect(r.resolveMeta.classification).toBe('BOT_SHELL');
  });
});
