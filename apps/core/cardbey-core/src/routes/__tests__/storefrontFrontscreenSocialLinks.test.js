/**
 * @vitest-environment node
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
      heroUrl: business.heroImageUrl,
      heroVideo: null,
      avatarUrl: business.avatarImageUrl,
      description: business.description,
      tagline: business.tagline,
      website: null,
      socialLinks: business.socialLinks ?? null,
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

describe('GET /api/storefront/frontscreen socialLinks', () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it('includes socialLinks on store cards', async () => {
    findManyMock.mockResolvedValue([
      {
        id: 'biz-1',
        name: 'Salon',
        slug: 'salon',
        type: 'Services',
        tagline: 'Hair',
        description: null,
        heroImageUrl: 'https://example.com/hero.jpg',
        avatarImageUrl: null,
        publishedAt: new Date(),
        stylePreferences: null,
        storefrontSettings: null,
        socialLinks: { instagram: 'https://instagram.com/salon' },
      },
    ]);

    const res = await request(makeApp()).get('/api/storefront/frontscreen?limit=10').expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.stores[0].socialLinks).toEqual({ instagram: 'https://instagram.com/salon' });
  });

  it('omits icon row data when socialLinks is null', async () => {
    findManyMock.mockResolvedValue([
      {
        id: 'biz-2',
        name: 'Empty',
        slug: 'empty',
        type: 'Food',
        tagline: null,
        description: null,
        heroImageUrl: 'https://example.com/hero.jpg',
        avatarImageUrl: null,
        publishedAt: new Date(),
        stylePreferences: null,
        storefrontSettings: null,
        socialLinks: null,
      },
    ]);

    const res = await request(makeApp()).get('/api/storefront/frontscreen?limit=10').expect(200);

    expect(res.body.stores[0].socialLinks).toBeNull();
  });
});
