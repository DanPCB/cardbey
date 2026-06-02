import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildHeroPreviewPatchFromUrls,
  getHeroSyncStateForStore,
  syncBusinessHeroProfile,
} from './heroUpdateService.js';

vi.mock('../../lib/draftResolver.js', () => ({
  resolveDraftForStore: vi.fn(),
}));

vi.mock('../publishedArtifactProjection/getPublishedBusinessArtifact.js', () => ({
  getPublishedBusinessArtifact: vi.fn(),
}));

import { resolveDraftForStore } from '../../lib/draftResolver.js';
import { getPublishedBusinessArtifact } from '../publishedArtifactProjection/getPublishedBusinessArtifact.js';

const VIDEO = 'https://cdn.example.com/hero.mp4';
const PEXELS = 'https://images.pexels.com/old-poster.jpg';
const LIVE = 'https://cdn.example.com/live-hero.jpg';
const USER_ID = 'user-1';
const STORE_ID = 'store-1';

function makePrisma(business, draftPreview) {
  return {
    business: {
      findUnique: vi.fn().mockResolvedValue(business),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

describe('getHeroSyncStateForStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('video hero: draftHeroUrl === businessVideoUrl → inSync true even when businessHeroUrl is stale Pexels', async () => {
    const prisma = makePrisma({
      userId: USER_ID,
      heroImageUrl: PEXELS,
      stylePreferences: { heroVideo: VIDEO },
      publishedAt: null,
      isActive: true,
    });
    vi.mocked(resolveDraftForStore).mockResolvedValue({
      draft: {
        id: 'draft-1',
        preview: {
          heroMediaType: 'video',
          heroVideo: VIDEO,
          hero: { type: 'video', videoUrl: VIDEO, imageUrl: PEXELS },
          heroImageUrl: VIDEO,
        },
      },
    });
    vi.mocked(getPublishedBusinessArtifact).mockResolvedValue({
      projection: { heroUrl: null },
    });

    const state = await getHeroSyncStateForStore(prisma, STORE_ID, USER_ID);

    expect(state.draftHeroUrl).toBe(VIDEO);
    expect(state.businessHeroUrl).toBe(PEXELS);
    expect(state.businessVideoUrl).toBe(VIDEO);
    expect(state.inSync).toBe(true);
    expect(state.hasUnpublishedHeroChanges).toBe(false);
  });

  it('hasUnpublishedHeroChanges true when isLive and liveHeroUrl is null but draft has hero', async () => {
    const prisma = makePrisma({
      userId: USER_ID,
      heroImageUrl: VIDEO,
      stylePreferences: { heroVideo: VIDEO },
      publishedAt: new Date(),
      isActive: true,
    });
    vi.mocked(resolveDraftForStore).mockResolvedValue({
      draft: {
        id: 'draft-1',
        preview: {
          heroMediaType: 'video',
          heroVideo: VIDEO,
          hero: { type: 'video', videoUrl: VIDEO },
        },
      },
    });
    vi.mocked(getPublishedBusinessArtifact).mockResolvedValue({
      projection: { heroUrl: null },
    });

    const state = await getHeroSyncStateForStore(prisma, STORE_ID, USER_ID);

    expect(state.isLive).toBe(true);
    expect(state.liveHeroUrl).toBeNull();
    expect(state.hasUnpublishedHeroChanges).toBe(true);
  });

  it('hasUnpublishedHeroChanges false when draft hero matches live artifact', async () => {
    const prisma = makePrisma({
      userId: USER_ID,
      heroImageUrl: LIVE,
      stylePreferences: {},
      publishedAt: new Date(),
      isActive: true,
    });
    vi.mocked(resolveDraftForStore).mockResolvedValue({
      draft: {
        id: 'draft-1',
        preview: {
          heroImageUrl: LIVE,
          hero: { type: 'image', imageUrl: LIVE, url: LIVE },
        },
      },
    });
    vi.mocked(getPublishedBusinessArtifact).mockResolvedValue({
      projection: { heroUrl: LIVE },
    });

    const state = await getHeroSyncStateForStore(prisma, STORE_ID, USER_ID);

    expect(state.inSync).toBe(true);
    expect(state.hasUnpublishedHeroChanges).toBe(false);
  });

  it('hasUnpublishedHeroChanges true when live hero differs from draft', async () => {
    const prisma = makePrisma({
      userId: USER_ID,
      heroImageUrl: LIVE,
      stylePreferences: {},
      publishedAt: new Date(),
      isActive: true,
    });
    vi.mocked(resolveDraftForStore).mockResolvedValue({
      draft: {
        id: 'draft-1',
        preview: {
          heroImageUrl: VIDEO,
          hero: { type: 'video', videoUrl: VIDEO },
          heroVideo: VIDEO,
          heroMediaType: 'video',
        },
      },
    });
    vi.mocked(getPublishedBusinessArtifact).mockResolvedValue({
      projection: { heroUrl: LIVE },
    });

    const state = await getHeroSyncStateForStore(prisma, STORE_ID, USER_ID);

    expect(state.hasUnpublishedHeroChanges).toBe(true);
    expect(state.inSync).toBe(false);
  });
});

describe('buildHeroPreviewPatchFromUrls', () => {
  it('video-only upload does not keep stale Pexels on hero.imageUrl', () => {
    const patch = buildHeroPreviewPatchFromUrls({
      videoUrl: VIDEO,
      source: 'upload',
      existingPreview: {
        hero: { type: 'video', imageUrl: PEXELS, videoUrl: '/uploads/old.mp4' },
        heroImageUrl: PEXELS,
      },
    });
    expect(patch.heroVideo).toBe(VIDEO);
    expect(patch.heroVideoUrl).toBe(VIDEO);
    expect(patch.heroImageUrl).toBeNull();
    expect(patch.hero?.videoUrl).toBe(VIDEO);
    expect(patch.hero?.imageUrl).toBeUndefined();
  });

  it('image-only patch with existing video keeps video when not explicit replace', () => {
    const patch = buildHeroPreviewPatchFromUrls({
      imageUrl: 'https://cdn.example.com/generated-still.jpg',
      source: 'url',
      existingPreview: {
        heroVideoUrl: VIDEO,
        heroMediaType: 'video',
        hero: { type: 'video', videoUrl: VIDEO },
      },
    });
    expect(patch).toEqual({});
  });

  it('image-only patch with no video writes canonical image hero', () => {
    const patch = buildHeroPreviewPatchFromUrls({
      imageUrl: 'https://cdn.example.com/new-hero.jpg',
      source: 'upload',
      existingPreview: {},
    });
    expect(patch.heroMediaType).toBe('image');
    expect(patch.heroImageUrl).toBe('https://cdn.example.com/new-hero.jpg');
    expect(patch.heroVideoUrl).toBeNull();
    expect(patch.hero?.type).toBe('image');
  });

  it('explicit image upload may replace video', () => {
    const patch = buildHeroPreviewPatchFromUrls({
      imageUrl: 'https://cdn.example.com/new-hero.jpg',
      source: 'upload',
      existingPreview: {
        heroVideoUrl: VIDEO,
        heroMediaType: 'video',
      },
    });
    expect(patch.heroMediaType).toBe('image');
    expect(patch.heroImageUrl).toBe('https://cdn.example.com/new-hero.jpg');
    expect(patch.heroVideoUrl).toBeNull();
  });
});

describe('syncBusinessHeroProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips business row update when store is live (draft-only until republish)', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      business: {
        findUnique: vi.fn().mockResolvedValue({
          stylePreferences: { heroImage: PEXELS },
          publishedAt: new Date(),
          isActive: true,
        }),
        update,
      },
    };

    const mergedPreview = {
      heroMediaType: 'video',
      heroVideo: VIDEO,
      hero: { type: 'video', videoUrl: VIDEO, url: VIDEO },
      heroImageUrl: VIDEO,
    };

    const ok = await syncBusinessHeroProfile(prisma, STORE_ID, mergedPreview);
    expect(ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('video without poster: sets heroImageUrl to video URL when store is not live', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      business: {
        findUnique: vi.fn().mockResolvedValue({
          stylePreferences: { heroImage: PEXELS },
          publishedAt: null,
          isActive: false,
        }),
        update,
      },
    };

    const mergedPreview = {
      heroMediaType: 'video',
      heroVideo: VIDEO,
      hero: { type: 'video', videoUrl: VIDEO, url: VIDEO },
      heroImageUrl: VIDEO,
    };

    const ok = await syncBusinessHeroProfile(prisma, STORE_ID, mergedPreview);

    expect(ok).toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: STORE_ID },
      data: expect.objectContaining({
        heroImageUrl: VIDEO,
        stylePreferences: expect.objectContaining({
          heroVideo: VIDEO,
          heroImage: VIDEO,
        }),
      }),
    });
  });

  it('video with poster: sets heroImageUrl to poster image', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      business: {
        findUnique: vi.fn().mockResolvedValue({
          stylePreferences: {},
          publishedAt: null,
          isActive: false,
        }),
        update,
      },
    };

    const mergedPreview = {
      heroMediaType: 'video',
      heroVideo: VIDEO,
      hero: { type: 'video', videoUrl: VIDEO, imageUrl: PEXELS },
      heroImageUrl: PEXELS,
    };

    await syncBusinessHeroProfile(prisma, STORE_ID, mergedPreview);

    expect(update).toHaveBeenCalledWith({
      where: { id: STORE_ID },
      data: expect.objectContaining({
        heroImageUrl: PEXELS,
        stylePreferences: expect.objectContaining({
          heroVideo: VIDEO,
          heroImage: PEXELS,
        }),
      }),
    });
  });
});
