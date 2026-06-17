/**
 * MC Hair Salon: slug, feed, and frontscreen-shaped list resolve the same projection fields.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildPublishedBusinessArtifact } from '../src/services/publishedArtifactProjection/buildPublishedBusinessArtifact.js';
import { publishedBusinessArtifactToPublicStore } from '../src/services/publishedArtifactProjection/publishedBusinessArtifactToPublicStore.js';
import {
  resolvePublicStoresForList,
  publicStoreParitySnapshot,
} from '../src/services/publishedArtifactProjection/resolvePublicStoreList.js';
import { resolvePublicStoreFromArtifact } from '../src/services/publishedArtifactProjection/getPublishedBusinessArtifact.js';

const MC_BUSINESS = {
  id: 'biz-mc',
  userId: 'tenant-1',
  name: 'MC Hair Salon',
  slug: 'mc-hair-salon',
  type: 'service',
  description: 'Full salon experience in Melbourne.',
  tagline: 'Style that speaks',
  isActive: true,
  publishedAt: new Date('2026-01-01'),
  heroImageUrl: 'https://cdn.example.com/hero.mp4',
  avatarImageUrl: 'https://cdn.example.com/avatar.jpg',
  stylePreferences: {
    heroVideo: 'https://cdn.example.com/hero.mp4',
    heroImage: 'https://cdn.example.com/poster.jpg',
    miniWebsite: {
      sections: [
        {
          type: 'hero',
          content: {
            type: 'video',
            videoUrl: 'https://cdn.example.com/hero.mp4',
            imageUrl: 'https://cdn.example.com/poster.jpg',
          },
        },
      ],
    },
    publishedArtifactProjection: null,
  },
  createdAt: new Date('2026-01-01'),
};

const MC_PROJECTION = buildPublishedBusinessArtifact({
  business: MC_BUSINESS,
  draftPreview: {
    tagline: 'Style that speaks',
    description: 'Full salon experience in Melbourne.',
    heroVideo: 'https://cdn.example.com/hero.mp4',
  },
  source: 'test',
});

MC_BUSINESS.stylePreferences.publishedArtifactProjection = MC_PROJECTION;

function mockPrismaWithProjection(projection) {
  const row = {
    businessId: projection.businessId ?? 'biz-mc',
    slug: projection.slug ?? 'mc-hair-salon',
    projectionJson: projection,
  };
  return {
    publishedArtifactProjection: {
      upsert: async () => ({}),
      findMany: async ({ where }) =>
        (where?.businessId?.in ?? []).map((businessId) => ({
          ...row,
          businessId,
        })),
      findUnique: async ({ where }) =>
        where?.businessId === row.businessId ? row : null,
      findFirst: async ({ where }) =>
        where?.slug === row.slug ? row : null,
    },
    business: {
      findFirst: async () => null,
      findUnique: async () => null,
    },
    storeOffer: { findMany: async () => [] },
    storePromo: { findMany: async () => [] },
    campaignV2: { findMany: async () => [] },
    loyaltyProgram: { findMany: async () => [] },
  };
}

describe('publicFeedProjectionParity', () => {
  let logSpy;
  let warnSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('MC Hair Salon matches across slug, feed list, and frontscreen-shaped resolver', async () => {
    const prisma = mockPrismaWithProjection(MC_PROJECTION);

    const slugRoute = publishedBusinessArtifactToPublicStore(MC_PROJECTION, {
      business: MC_BUSINESS,
    });
    slugRoute.storeUrl = `http://localhost:5174/s/mc-hair-salon`;

    const [feedEntry] = await resolvePublicStoresForList(prisma, [MC_BUSINESS], {
      route: 'GET /api/public/stores/feed',
    });
    const feedStore = feedEntry.store;

    const [frontscreenEntry] = await resolvePublicStoresForList(prisma, [MC_BUSINESS], {
      route: 'GET /api/storefront/frontscreen',
    });
    const frontscreenStore = frontscreenEntry.store;

    const slugSnap = publicStoreParitySnapshot(slugRoute);
    const feedSnap = publicStoreParitySnapshot(feedStore);
    const frontSnap = publicStoreParitySnapshot(frontscreenStore);

    expect(feedSnap).toEqual(slugSnap);
    expect(frontSnap).toEqual(slugSnap);
    expect(slugSnap.name).toBe('MC Hair Salon');
    expect(slugSnap.tagline).toBe('Style that speaks');
    expect(slugSnap.description).toBe('Full salon experience in Melbourne.');
    expect(slugSnap.heroVideo).toBe('https://cdn.example.com/hero.mp4');
    expect(slugSnap.websiteSections).toBe(1);
    expect(feedSnap.storeUrl).toContain('/s/mc-hair-salon');
    expect(feedSnap.description).not.toMatch(/browse our menu/i);
  });

  it('resolvePublicStoreFromArtifact uses persisted projection without legacy hero fallback', async () => {
    const prisma = mockPrismaWithProjection(MC_PROJECTION);
    const { store, usedFallback } = await resolvePublicStoreFromArtifact(prisma, MC_BUSINESS);
    const snap = publicStoreParitySnapshot(store);

    expect(usedFallback).toBe(false);
    expect(snap.tagline).toBe('Style that speaks');
    expect(snap.heroVideo).toBe('https://cdn.example.com/hero.mp4');
    expect(warnSpy).not.toHaveBeenCalledWith(
      '[PUBLIC_ARTIFACT_FALLBACK_USED]',
      expect.objectContaining({ slug: 'mc-hair-salon' }),
    );
  });

  it('logs PUBLIC_FEED_PROJECTION_PARITY on feed resolve', async () => {
    const prisma = mockPrismaWithProjection(MC_PROJECTION);
    await resolvePublicStoresForList(prisma, [MC_BUSINESS], {
      route: 'GET /api/public/stores/feed',
    });
    expect(logSpy).toHaveBeenCalledWith(
      '[PUBLIC_FEED_PROJECTION_PARITY]',
      expect.objectContaining({
        route: 'GET /api/public/stores/feed',
        slug: 'mc-hair-salon',
      }),
    );
  });
});
