/**
 * @vitest-environment node
 * Contract: GET /api/storefront/frontscreen exposes heroVideo for dashboard reels.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findManyMock = vi.fn();

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: () => ({
    business: {
      findMany: findManyMock,
    },
  }),
}));

vi.mock('../../services/publishedArtifactProjection/getPublishedBusinessArtifact.js', () => ({
  resolvePublicStoreFromArtifact: vi.fn(async (_prisma, business) => ({
    store: {
      id: business.id,
      name: business.name,
      slug: business.slug,
      type: business.type,
      heroUrl: business._testHeroUrl ?? business.heroImageUrl,
      heroVideo: business._testHeroVideo ?? null,
      avatarUrl: business.avatarImageUrl,
      description: business.description,
      tagline: business.tagline,
      website: null,
      socialLinks: null,
      transactionMode: 'order',
      catalogLabel: 'Products',
      ctaLabel: 'Order now',
    },
    source: 'test',
  })),
}));

import storefrontRoutes from '../storefrontRoutes.js';

function makeApp() {
  const app = express();
  app.use('/api/storefront', storefrontRoutes);
  return app;
}

describe('GET /api/storefront/frontscreen hero media', () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it('returns heroVideo and heroImageUrl when published store has video hero', async () => {
    findManyMock.mockResolvedValue([
      {
        id: 'biz-video',
        name: 'Video Store',
        slug: 'video-store',
        type: 'Retail',
        tagline: 'Tag',
        description: null,
        heroImageUrl: 'https://cdn.example.com/poster.jpg',
        avatarImageUrl: 'https://cdn.example.com/avatar.jpg',
        publishedAt: new Date(),
        stylePreferences: null,
        storefrontSettings: null,
        socialLinks: null,
        _testHeroUrl: 'https://cdn.example.com/hero.mp4',
        _testHeroVideo: 'https://cdn.example.com/hero.mp4',
      },
    ]);

    const res = await request(makeApp()).get('/api/storefront/frontscreen?limit=10').expect(200);

    expect(res.body.stores[0].heroVideo).toBe('https://cdn.example.com/hero.mp4');
    expect(res.body.stores[0].heroImageUrl).toBe('https://cdn.example.com/hero.mp4');
  });
});
