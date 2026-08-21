import { describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/slug.js', () => ({
  slugify: (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'other',
}));

vi.mock('./draftStoreService.js', () => ({
  normalizePreviewCategories: (preview) => preview,
}));

vi.mock('./draftPreviewHeroSync.js', () => ({
  resolveCanonicalHeroMediaFromPreview: (seed) => ({
    url: seed.heroVideoUrl || seed.heroImageUrl || null,
    videoUrl: seed.heroVideoUrl || null,
    imageUrl: seed.heroImageUrl || null,
    mediaType: seed.heroVideoUrl ? 'video' : 'image',
  }),
  writeCanonicalHeroMediaToPreview: (preview, canonical) => {
    if (canonical?.url) {
      preview.hero = { url: canonical.url, imageUrl: canonical.imageUrl, videoUrl: canonical.videoUrl };
      if (canonical.mediaType === 'video') preview.heroMediaType = 'video';
      else preview.heroMediaType = 'image';
    }
  },
}));

vi.mock('./buildDraftPublishState.js', () => ({
  buildDraftPublishState: vi.fn(async () => ({ isLive: true, hasUnpublishedChanges: false })),
}));

vi.mock('./publishSnapshotService.js', () => ({
  isPublishSnapshotV1Enabled: () => false,
  refreshPublishSnapshotFromCurrentPreview: vi.fn(),
}));

import { buildPreviewFromPublishedBusiness } from './restoreDraftFromPublished.js';

describe('buildPreviewFromPublishedBusiness', () => {
  it('builds catalog + hero from live business', async () => {
    const prisma = {
      business: {
        findUnique: vi.fn(async () => ({
          id: 'biz-1',
          name: 'MMM Fashion',
          type: 'Fashion',
          description: null,
          logo: null,
          primaryColor: '#111',
          secondaryColor: '#222',
          tagline: 'Style Meets Melbourne',
          heroText: null,
          heroImageUrl: 'https://cdn.example.com/live-hero.jpg',
          avatarImageUrl: 'https://cdn.example.com/live-avatar.jpg',
          stylePreferences: {
            miniWebsite: { sections: [{ type: 'hero' }] },
            heroVideo: null,
          },
          publishedAt: new Date('2024-08-14T00:00:00Z'),
          isActive: true,
          slug: 'mmm-fashion',
        })),
      },
      product: {
        findMany: vi.fn(async () => [
          {
            id: 'p1',
            name: 'Dress',
            description: null,
            price: 40,
            category: 'Apparel',
            imageUrl: null,
          },
        ]),
      },
    };

    const preview = await buildPreviewFromPublishedBusiness(prisma, 'biz-1');
    expect(preview.storeName).toBe('MMM Fashion');
    expect(preview.items).toHaveLength(1);
    expect(preview.website?.sections?.[0]?.type).toBe('hero');
    expect(preview.hero?.url || preview.hero?.imageUrl).toContain('live-hero');
    expect(preview.avatarImageUrl).toContain('live-avatar');
  });

  it('rejects non-live stores', async () => {
    const prisma = {
      business: {
        findUnique: vi.fn(async () => ({
          id: 'biz-1',
          name: 'Draft Only',
          type: 'General',
          publishedAt: null,
          isActive: false,
          slug: null,
          stylePreferences: {},
        })),
      },
      product: { findMany: vi.fn() },
    };
    await expect(buildPreviewFromPublishedBusiness(prisma, 'biz-1')).rejects.toMatchObject({
      code: 'store_not_live',
    });
  });
});
