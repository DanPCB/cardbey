/**
 * GET /api/public/stores/feed
 * - Returns 200 with items + nextCursor; no auth required.
 * - category=services returns stores whose type is in FEED_CATEGORY_TYPES.services (service discoverability).
 * - category=products returns product-type stores.
 * - No category returns all active stores.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';

const prisma = new PrismaClient();
const testRequest = request(app);

describe('GET /api/public/stores/feed', () => {
  let testUser;
  let serviceStore;
  let productStore;

  beforeEach(async () => {
    await resetDb(prisma);

    testUser = await prisma.user.create({
      data: {
        email: 'feed-test@example.com',
        passwordHash: 'hash',
        displayName: 'Feed Test User',
        roles: '["viewer"]',
      },
    });

    serviceStore = await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Union Road Beauty',
        type: 'beauty',
        slug: 'union-road-beauty',
        description: 'Beauty salon',
        isActive: true,
      },
    });

    productStore = await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Test Florist',
        type: 'florist',
        slug: 'test-florist',
        description: 'Flowers',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('returns 200 with items and nextCursor (no auth)', async () => {
    const res = await testRequest
      .get('/api/public/stores/feed?limit=10')
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    expect(res.body.nextCursor === null || typeof res.body.nextCursor === 'string').toBe(true);
    const ids = res.body.items.map((i) => i.id);
    expect(ids).toContain(serviceStore.id);
    expect(ids).toContain(productStore.id);
  });

  it('category=services returns service-type stores only', async () => {
    const res = await testRequest
      .get('/api/public/stores/feed?limit=10&category=services')
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
    const ids = res.body.items.map((i) => i.id);
    expect(ids).toContain(serviceStore.id);
    expect(ids).not.toContain(productStore.id);
  });

  it('category=products returns product-type stores (e.g. florist)', async () => {
    const res = await testRequest
      .get('/api/public/stores/feed?limit=10&category=products')
      .expect(200);
    expect(res.body.ok).toBe(true);
    const ids = res.body.items.map((i) => i.id);
    expect(ids).toContain(productStore.id);
  });

  it('orders by publishedAt desc so a recently published store ranks above newer drafts', async () => {
    const recentlyPublished = await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Glamshell Beauty',
        type: 'beauty',
        slug: 'glamshell-beauty',
        description: 'Recently published',
        isActive: true,
        createdAt: new Date('2026-01-15T10:00:00.000Z'),
        publishedAt: new Date('2026-06-29T12:00:00.000Z'),
      },
    });

    await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Older Published Cafe',
        type: 'cafe',
        slug: 'older-published-cafe',
        description: 'Published earlier',
        isActive: true,
        createdAt: new Date('2026-06-28T10:00:00.000Z'),
        publishedAt: new Date('2026-06-01T08:00:00.000Z'),
      },
    });

    const res = await testRequest
      .get('/api/public/stores/feed?limit=20')
      .expect(200);

    expect(res.body.items[0]?.id).toBe(recentlyPublished.id);
    expect(res.body.items[0]?.publishedAt).toBeTruthy();
  });

  it('returns each storeId at most once when duplicate published businesses share identity', async () => {
    await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Union Road Beauty',
        type: 'beauty',
        slug: 'union-road-beauty-2',
        description: 'Republish duplicate',
        isActive: true,
      },
    });

    const res = await testRequest
      .get('/api/public/stores/feed?limit=20')
      .expect(200);

    const beautyRows = res.body.items.filter((i) =>
      String(i.name ?? '').toLowerCase().includes('union road beauty'),
    );
    expect(beautyRows.length).toBeLessThanOrEqual(1);

    const ids = res.body.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('suburb filter returns only stores in that suburb', async () => {
    await prisma.business.update({
      where: { id: serviceStore.id },
      data: { suburb: 'Braybrook' },
    });
    await prisma.business.update({
      where: { id: productStore.id },
      data: { suburb: 'Fitzroy' },
    });

    const res = await testRequest
      .get('/api/public/stores/feed?limit=20&suburb=Braybrook')
      .expect(200);

    expect(res.body.ok).toBe(true);
    const ids = res.body.items.map((i) => i.id);
    expect(ids).toContain(serviceStore.id);
    expect(ids).not.toContain(productStore.id);
    for (const item of res.body.items) {
      expect(String(item.suburb ?? '').toLowerCase()).toBe('braybrook');
    }
  });

  it('suburb filter is case-insensitive', async () => {
    await prisma.business.update({
      where: { id: serviceStore.id },
      data: { suburb: 'Carlton' },
    });

    const res = await testRequest
      .get('/api/public/stores/feed?limit=20&suburb=carlton')
      .expect(200);

    const ids = res.body.items.map((i) => i.id);
    expect(ids).toContain(serviceStore.id);
  });
});

describe('GET /api/public/stores/suburbs', () => {
  let testUser;

  beforeEach(async () => {
    await resetDb(prisma);

    testUser = await prisma.user.create({
      data: {
        email: 'suburbs-test@example.com',
        passwordHash: 'hash',
        displayName: 'Suburbs Test User',
        roles: '["viewer"]',
      },
    });

    await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Braybrook Cafe',
        type: 'cafe',
        slug: 'braybrook-cafe',
        suburb: 'Braybrook',
        isActive: true,
      },
    });

    await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Braybrook Bakery',
        type: 'bakery',
        slug: 'braybrook-bakery',
        suburb: 'Braybrook',
        isActive: true,
      },
    });

    await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Fitzroy Shop',
        type: 'retail',
        slug: 'fitzroy-shop',
        suburb: 'Fitzroy',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('returns suburbs with counts sorted by count desc', async () => {
    const res = await testRequest.get('/api/public/stores/suburbs').expect(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.suburbs)).toBe(true);
    expect(res.body.suburbs[0]).toEqual({ suburb: 'Braybrook', count: 2 });
    expect(res.body.suburbs).toContainEqual({ suburb: 'Fitzroy', count: 1 });
  });
});

describe('GET /api/public/stores/category-counts', () => {
  let testUser;

  beforeEach(async () => {
    await resetDb(prisma);

    testUser = await prisma.user.create({
      data: {
        email: 'category-counts-test@example.com',
        passwordHash: 'hash',
        displayName: 'Category Counts Test User',
        roles: '["viewer"]',
      },
    });

    await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Braybrook Cafe',
        type: 'cafe',
        slug: 'braybrook-cafe-counts',
        suburb: 'Braybrook',
        isActive: true,
      },
    });

    await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Braybrook Florist',
        type: 'florist',
        slug: 'braybrook-florist-counts',
        suburb: 'Braybrook',
        isActive: true,
      },
    });

    await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Fitzroy Salon',
        type: 'beauty',
        slug: 'fitzroy-salon-counts',
        suburb: 'Fitzroy',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('returns counts for each feed category lane', async () => {
    const res = await testRequest.get('/api/public/stores/category-counts').expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.counts.food).toBeGreaterThanOrEqual(1);
    expect(res.body.counts.products).toBeGreaterThanOrEqual(1);
    expect(res.body.counts.offers).toBe(0);
    expect(res.body.counts.others).toBe(0);
    expect(
      res.body.counts.food + res.body.counts.products + res.body.counts.services,
    ).toBeGreaterThanOrEqual(2);
  });

  it('scopes counts when suburb filter is applied', async () => {
    const allRes = await testRequest.get('/api/public/stores/category-counts').expect(200);
    const scopedRes = await testRequest
      .get('/api/public/stores/category-counts?suburb=Braybrook')
      .expect(200);

    const allTotal =
      allRes.body.counts.food +
      allRes.body.counts.products +
      allRes.body.counts.services +
      allRes.body.counts.offers;
    const scopedTotal =
      scopedRes.body.counts.food +
      scopedRes.body.counts.products +
      scopedRes.body.counts.services +
      scopedRes.body.counts.offers;

    expect(scopedTotal).toBeLessThanOrEqual(allTotal);
    expect(scopedRes.body.counts.food).toBeGreaterThanOrEqual(1);
    expect(scopedRes.body.counts.products).toBeGreaterThanOrEqual(1);
    expect(scopedRes.body.counts.food + scopedRes.body.counts.products).toBe(2);
  });
});
