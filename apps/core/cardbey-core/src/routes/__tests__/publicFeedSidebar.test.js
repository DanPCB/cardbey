/**
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const businessFindManyMock = vi.fn();
const storeOfferFindManyMock = vi.fn();
const intentSignalFindManyMock = vi.fn();
const metricsFindManyMock = vi.fn();
const engagementSnapshotFindManyMock = vi.fn().mockResolvedValue([]);

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: () => ({
    business: { findMany: businessFindManyMock },
    storeOffer: { findMany: storeOfferFindManyMock },
    intentSignal: { findMany: intentSignalFindManyMock },
    contentInteractionMetrics: { findMany: metricsFindManyMock },
    storeEngagementSnapshot: { findMany: engagementSnapshotFindManyMock },
  }),
}));

vi.mock('../../middleware/auth.js', () => ({
  optionalAuth: (_req, _res, next) => next(),
}));

import publicFeedRoutes from '../publicFeedRoutes.js';
import { clearSidebarCache } from '../../services/feed/publicFeedSidebarCache.js';
import {
  businessMatchesSidebarCategory,
  haversineKm,
} from '../../services/feed/publicFeedSidebarService.js';

function makeApp() {
  const app = express();
  app.use('/api/public-feed', publicFeedRoutes);
  return app;
}

const now = new Date();
const weekAgo = new Date(now);
weekAgo.setDate(weekAgo.getDate() - 3);

function sampleBusiness(overrides = {}) {
  return {
    id: 'store-1',
    name: 'Cafe One',
    slug: 'cafe-one',
    type: 'Cafe',
    isActive: true,
    userId: 'owner-1',
    publishedAt: weekAgo,
    heroImageUrl: 'https://cdn.example.com/hero.jpg',
    avatarImageUrl: null,
    logo: null,
    suburb: 'Carlton',
    city: 'Melbourne',
    region: null,
    lat: -37.8,
    lng: 144.96,
    tagline: 'Great coffee',
    description: null,
    phone: '0400000000',
    websiteUrl: null,
    storefrontSettings: { promoted: true },
    createdAt: weekAgo,
    updatedAt: now,
    ...overrides,
  };
}

describe('publicFeedSidebarService helpers', () => {
  it('haversineKm returns small distance for nearby coords', () => {
    const d = haversineKm(-37.8136, 144.9631, -37.8, 144.96);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(5);
  });

  it('businessMatchesSidebarCategory filters food', () => {
    expect(businessMatchesSidebarCategory('Vietnamese Restaurant', 'food')).toBe(true);
    expect(businessMatchesSidebarCategory('Retail Shop', 'food')).toBe(false);
  });
});

describe('GET /api/public-feed/sidebar', () => {
  beforeEach(() => {
    clearSidebarCache();
    businessFindManyMock.mockReset();
    storeOfferFindManyMock.mockReset();
    intentSignalFindManyMock.mockReset();
    metricsFindManyMock.mockReset();
    intentSignalFindManyMock.mockResolvedValue([]);
    metricsFindManyMock.mockResolvedValue([]);
    storeOfferFindManyMock.mockResolvedValue([]);
  });

  it('returns four sections with real store shape', async () => {
    businessFindManyMock.mockResolvedValue([
      sampleBusiness({ id: 'store-1', slug: 'cafe-one' }),
      sampleBusiness({
        id: 'store-2',
        name: 'New Shop',
        slug: 'new-shop',
        storefrontSettings: {},
        publishedAt: weekAgo,
      }),
    ]);

    const res = await request(makeApp())
      .get('/api/public-feed/sidebar?limitPerSection=3')
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.featuredNow)).toBe(true);
    expect(Array.isArray(res.body.nearbyBusinesses)).toBe(true);
    expect(Array.isArray(res.body.activeOffers)).toBe(true);
    expect(Array.isArray(res.body.newThisWeek)).toBe(true);
    expect(res.body.generatedAt).toBeTruthy();
    expect(res.body.locationSource).toBe('platform_default');
    expect(res.body.featuredNow[0]?.slug).toBe('cafe-one');
    expect(res.body.featuredNow[0]?.canManage).toBe(false);
  });

  it('featuredNow prioritizes promoted stores', async () => {
    businessFindManyMock.mockResolvedValue([
      sampleBusiness({ id: 'a', name: 'Plain', slug: 'plain', storefrontSettings: {}, activityScore: 0 }),
      sampleBusiness({ id: 'b', name: 'Promoted', slug: 'promoted', storefrontSettings: { promoted: true } }),
    ]);

    const res = await request(makeApp()).get('/api/public-feed/sidebar?limitPerSection=5').expect(200);
    expect(res.body.featuredNow[0]?.name).toBe('Promoted');
  });

  it('activeOffers returns valid offers for published stores', async () => {
    businessFindManyMock.mockResolvedValue([sampleBusiness()]);
    storeOfferFindManyMock.mockResolvedValue([
      {
        id: 'offer-1',
        storeId: 'store-1',
        title: '20% off',
        description: 'Today only',
        priceText: '20% off',
        startsAt: weekAgo,
        endsAt: new Date(now.getTime() + 86400000),
        createdAt: weekAgo,
      },
    ]);

    const res = await request(makeApp()).get('/api/public-feed/sidebar').expect(200);
    expect(res.body.activeOffers).toHaveLength(1);
    expect(res.body.activeOffers[0].title).toBe('20% off');
    expect(res.body.activeOffers[0].storeSlug).toBe('cafe-one');
  });

  it('newThisWeek only includes recently published stores', async () => {
    const old = new Date();
    old.setDate(old.getDate() - 30);
    businessFindManyMock.mockResolvedValue([
      sampleBusiness({
        id: 'new-1',
        publishedAt: weekAgo,
        heroImageUrl: null,
        storefrontSettings: {},
      }),
      sampleBusiness({
        id: 'old-1',
        name: 'Old',
        slug: 'old',
        publishedAt: old,
        heroImageUrl: null,
        storefrontSettings: {},
      }),
    ]);

    const res = await request(makeApp()).get('/api/public-feed/sidebar').expect(200);
    const ids = res.body.newThisWeek.map((s) => s.id);
    expect(ids).toContain('new-1');
    expect(ids).not.toContain('old-1');
  });

  it('uses geolocation for nearby sorting when lat/lng provided', async () => {
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    businessFindManyMock.mockResolvedValue([
      sampleBusiness({
        id: 'near',
        lat: -37.814,
        lng: 144.964,
        heroImageUrl: null,
        publishedAt: monthAgo,
        storefrontSettings: {},
      }),
      sampleBusiness({
        id: 'far',
        name: 'Far Cafe',
        slug: 'far',
        lat: -38.5,
        lng: 145.5,
        heroImageUrl: null,
        publishedAt: monthAgo,
        storefrontSettings: {},
      }),
    ]);

    const res = await request(makeApp())
      .get('/api/public-feed/sidebar?lat=-37.8136&lng=144.9631')
      .expect(200);

    expect(res.body.locationSource).toBe('geolocation');
    expect(res.body.nearbyBusinesses[0]?.id).toBe('near');
    expect(res.body.nearbyBusinesses[0]?.distanceKm).toBeLessThan(2);
  });
});
