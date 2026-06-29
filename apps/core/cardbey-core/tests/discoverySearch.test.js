/**
 * GET /api/discovery/search — unified marketplace discovery search.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';

const prisma = new PrismaClient();
const testRequest = request(app);

describe('GET /api/discovery/search', () => {
  let testUser;
  let coffeeStore;
  let beautyStore;
  let productStore;

  beforeEach(async () => {
    await resetDb(prisma);

    testUser = await prisma.user.create({
      data: {
        email: 'discovery-search@example.com',
        passwordHash: 'hash',
        displayName: 'Search Test User',
        roles: '["viewer"]',
      },
    });

    coffeeStore = await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'ABC Bakery',
        type: 'bakery',
        slug: 'abc-bakery',
        description: 'Premium coffee and pastries',
        city: 'Melbourne',
        isActive: true,
      },
    });

    beautyStore = await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Union Road Beauty',
        type: 'beauty',
        slug: 'union-road-beauty',
        description: 'Hair and nails',
        city: 'Melbourne',
        isActive: true,
      },
    });

    productStore = await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Test Florist',
        type: 'florist',
        slug: 'test-florist',
        description: 'Retail flowers and gifts',
        city: 'Melbourne',
        isActive: true,
      },
    });

    await prisma.product.create({
      data: {
        businessId: coffeeStore.id,
        name: 'Large Cappuccino',
        description: 'Fresh espresso with steamed milk',
        category: 'Coffee',
        isPublished: true,
        price: 5.5,
      },
    });

    await prisma.product.create({
      data: {
        businessId: productStore.id,
        name: 'Premium Coffee Beans',
        description: 'Single origin roast',
        category: 'Coffee',
        isPublished: true,
        price: 18.5,
      },
    });

    await prisma.product.create({
      data: {
        businessId: beautyStore.id,
        name: 'Coffee Scrub Treatment',
        description: 'Exfoliating coffee body scrub',
        category: 'Treatments',
        isPublished: true,
        price: 65,
      },
    });

    await prisma.storeOffer.create({
      data: {
        storeId: coffeeStore.id,
        slug: 'free-coffee-today',
        title: 'Free Coffee Today',
        description: 'First coffee on us',
        priceText: 'Free',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns matching stores by name', async () => {
    const res = await testRequest
      .get('/api/discovery/search?query=bakery&entityTypes=store')
      .expect(200);

    expect(res.body.ok).toBe(true);
    const titles = res.body.results.map((r) => r.title);
    expect(titles).toContain('ABC Bakery');
    expect(res.body.results[0].entityType).toBe('store');
  });

  it('returns menu items from restaurants', async () => {
    const res = await testRequest
      .get('/api/discovery/search?query=cappuccino&entityTypes=menu')
      .expect(200);

    expect(res.body.ok).toBe(true);
    const titles = res.body.results.map((r) => r.title);
    expect(titles).toContain('Large Cappuccino');
  });

  it('returns products across stores', async () => {
    const res = await testRequest
      .get('/api/discovery/search?query=coffee&entityTypes=product')
      .expect(200);

    expect(res.body.ok).toBe(true);
    const productTitles = res.body.results
      .filter((r) => r.entityType === 'product')
      .map((r) => r.title);
    expect(productTitles).toContain('Premium Coffee Beans');
  });

  it('returns services from service businesses', async () => {
    const res = await testRequest
      .get('/api/discovery/search?query=coffee&entityTypes=service')
      .expect(200);

    expect(res.body.ok).toBe(true);
    const titles = res.body.results.map((r) => r.title);
    expect(titles).toContain('Coffee Scrub Treatment');
  });

  it('returns offers', async () => {
    const res = await testRequest
      .get('/api/discovery/search?query=coffee&entityTypes=offer')
      .expect(200);

    expect(res.body.ok).toBe(true);
    const titles = res.body.results.map((r) => r.title);
    expect(titles).toContain('Free Coffee Today');
  });

  it('returns mixed entity types for broad query', async () => {
    const res = await testRequest
      .get('/api/discovery/search?query=coffee')
      .expect(200);

    expect(res.body.ok).toBe(true);
    const types = new Set(res.body.results.map((r) => r.entityType));
    expect(types.size).toBeGreaterThan(1);
  });

  it('includes href for navigation', async () => {
    const res = await testRequest
      .get('/api/discovery/search?query=bakery')
      .expect(200);

    const store = res.body.results.find((r) => r.title === 'ABC Bakery');
    expect(store?.href).toMatch(/^\/s\/abc-bakery/);
  });

  it('returns empty for short queries', async () => {
    const res = await testRequest.get('/api/discovery/search?query=c').expect(200);
    expect(res.body.results).toEqual([]);
  });

  it('returns suggestions when suggest=true', async () => {
    const res = await testRequest
      .get('/api/discovery/search?query=coffee&suggest=true')
      .expect(200);

    expect(res.body.suggestions.length).toBeGreaterThan(0);
  });

  it('returns zero results for nonsense query', async () => {
    const res = await testRequest
      .get('/api/discovery/search?query=zzzznonexistent999')
      .expect(200);

    expect(res.body.results).toEqual([]);
    expect(res.body.total).toBe(0);
  });
});
