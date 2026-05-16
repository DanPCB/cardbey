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
});
