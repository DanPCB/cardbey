/**
 * Tests for store statistics endpoint
 * - GET /api/stores/:id/stats
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';
import { prisma, seedTenantUserStore, seedProduct, cleanupTestData } from './_helpers/factory.js';
const testRequest = request(app);

let testUser;
let testToken;
let testStore;
let testProduct;
let testProduct2;
let testPlaylist;
let testScreen;

beforeAll(async () => {
  // Clean up any existing test data
  await cleanupTestData();

  // Create test user and store using factory
  const setup = await seedTenantUserStore({
    email: `stats-test-${Date.now()}@example.com`,
    storeName: 'Stats Test Store',
    storeSlug: `stats-test-store-${Date.now()}`,
  });
  testUser = setup.user;
  testStore = setup.business;
  testToken = setup.token;

  // Create 2 published products using factory
  testProduct = await seedProduct(testStore.id, {
    name: 'Test Product',
    price: 10.99,
    currency: 'USD',
    isPublished: true,
  });
  
  testProduct2 = await seedProduct(testStore.id, {
    name: 'Test Product 2',
    price: 5.99,
    currency: 'USD',
    isPublished: true,
  });

  // Verify testProduct and testProduct2 match stats query filters
  const testProductRefetched = await prisma.product.findUnique({
    where: { id: testProduct.id },
    select: {
      id: true,
      name: true,
      businessId: true,
      isPublished: true,
      deletedAt: true,
    }
  });

  const testProduct2Refetched = await prisma.product.findUnique({
    where: { id: testProduct2.id },
    select: {
      id: true,
      name: true,
      businessId: true,
      isPublished: true,
      deletedAt: true,
    }
  });

  // Assert both products match stats query filters
  expect(testProductRefetched.businessId).toBe(testStore.id);
  expect(testProductRefetched.deletedAt).toBeNull();
  expect(testProduct2Refetched.businessId).toBe(testStore.id);
  expect(testProduct2Refetched.deletedAt).toBeNull();

  if (process.env.DEBUG_TESTS === '1') {
    console.log('[Test] testProduct verified:', {
      id: testProductRefetched.id,
      name: testProductRefetched.name,
      businessId: testProductRefetched.businessId,
      testStoreId: testStore.id,
      businessIdMatch: testProductRefetched.businessId === testStore.id,
      deletedAt: testProductRefetched.deletedAt,
    });

    console.log('[Test] testProduct2 verified:', {
      id: testProduct2Refetched.id,
      name: testProduct2Refetched.name,
      businessId: testProduct2Refetched.businessId,
      testStoreId: testStore.id,
      businessIdMatch: testProduct2Refetched.businessId === testStore.id,
      deletedAt: testProduct2Refetched.deletedAt,
    });
  }

  // Create playlist using factory
  const { seedPlaylist } = await import('./_helpers/factory.js');
  testPlaylist = await seedPlaylist({
    name: 'Test Playlist',
    type: 'MEDIA',
  });

  // Create screen using factory
  const { seedScreen } = await import('./_helpers/factory.js');
  testScreen = await seedScreen(testStore.id, {
    fingerprint: 'test-screen-' + Date.now(),
    name: 'Test Screen',
    status: 'OFFLINE',
    paired: true,
  });
});

afterAll(async () => {
  await resetDb(prisma);
  await prisma.$disconnect();
});

describe('GET /api/stores/:id/stats', () => {
  it('should return store statistics', async () => {
    const response = await testRequest
      .get(`/api/stores/${testStore.id}/stats`)
      .set('Authorization', `Bearer ${testToken}`)
      .set('x-test-no-cache', '1') // Test-only header to bypass cache
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.stats).toBeDefined();
    expect(response.body.stats.products).toBeGreaterThanOrEqual(2); // testProduct + product2
    expect(response.body.stats.screens).toBeGreaterThanOrEqual(1);
    expect(response.body.stats.playlists).toBeGreaterThanOrEqual(1);
    expect(response.body.stats.lastUpdated).toBeTruthy();
  });

  it('should require authentication', async () => {
    const response = await testRequest
      .get(`/api/stores/${testStore.id}/stats`)
      .expect(401);

    expect(response.body.ok).toBe(false);
  });

  it('should return 404 for non-existent store', async () => {
    const response = await testRequest
      .get('/api/stores/non-existent-id/stats')
      .set('Authorization', `Bearer ${testToken}`)
      .set('x-test-no-cache', '1') // Test-only header to bypass cache
      .expect(404);

    expect(response.body.ok).toBe(false);
    expect(response.body.error).toContain('Store not found');
  });

  it('should cache response for 60 seconds', async () => {
    // First request
    const response1 = await testRequest
      .get(`/api/stores/${testStore.id}/stats`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    const firstTimestamp = response1.body.stats.lastUpdated;

    // Second request immediately (should be cached)
    const response2 = await testRequest
      .get(`/api/stores/${testStore.id}/stats`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    // Timestamp should be the same (cached)
    expect(response2.body.stats.lastUpdated).toBe(firstTimestamp);
  });

  it('should include correct product count', async () => {
    // We already have testProduct and testProduct2 from beforeAll (2 products)
    // Create one more product to have 3 total
    // Stats query filters: businessId = req.params.id AND deletedAt = null
    // Ensure product3 matches these exact filters
    const product3 = await seedProduct(testStore.id, {
      name: 'Product 3',
      price: 7.99,
      currency: 'USD',
      isPublished: true,
    });

    // Explicitly ensure deletedAt is null to match stats query filter exactly
    // Stats query: where: { businessId: id, deletedAt: null }
    await prisma.product.update({
      where: { id: product3.id },
      data: { 
        deletedAt: null, // Must be null to match stats query filter
        businessId: testStore.id, // Must match testStore.id (which is passed as req.params.id)
      },
    });

    // Re-fetch product3 from Prisma and assert it matches stats filters
    const product3Refetched = await prisma.product.findUnique({
      where: { id: product3.id },
      select: {
        id: true,
        name: true,
        businessId: true,
        isPublished: true,
        deletedAt: true,
      }
    });

    // Assert product3 matches stats query filters
    expect(product3Refetched).toBeDefined();
    expect(product3Refetched.businessId).toBe(testStore.id); // Must match store ID used in stats
    expect(product3Refetched.deletedAt).toBeNull(); // Must be null to be counted
    expect(product3Refetched.isPublished).toBe(true); // Set for consistency

    if (process.env.DEBUG_TESTS === '1') {
      console.log('[Test] Product3 verified:', {
        id: product3Refetched.id,
        name: product3Refetched.name,
        businessId: product3Refetched.businessId,
        testStoreId: testStore.id,
        businessIdMatch: product3Refetched.businessId === testStore.id,
        isPublished: product3Refetched.isPublished,
        deletedAt: product3Refetched.deletedAt,
      });
    }

    // DEBUG: Query Prisma directly using the same filters as stats route
    // Stats route filters: { businessId: id, deletedAt: null }
    const totalProductsForBusiness = await prisma.product.count({
      where: { businessId: testStore.id }
    });

    const publishedProductsForBusiness = await prisma.product.count({
      where: { 
        businessId: testStore.id,
        isPublished: true
      }
    });

    const countableProductsForBusiness = await prisma.product.count({
      where: { 
        businessId: testStore.id,
        deletedAt: null  // This is what stats route uses
      }
    });

    // Get all products for this business with details
    const allProductsForBusiness = await prisma.product.findMany({
      where: { businessId: testStore.id },
      select: {
        id: true,
        name: true,
        isPublished: true,
        deletedAt: true,
      },
      orderBy: { createdAt: 'asc' }
    });

    if (process.env.DEBUG_TESTS === '1') {
      console.log('[Test Debug] Product counts for businessId:', testStore.id);
      console.log('  - Total products:', totalProductsForBusiness);
      console.log('  - Published products:', publishedProductsForBusiness);
      console.log('  - Countable products (deletedAt=null):', countableProductsForBusiness);
      console.log('  - All products details:');
      allProductsForBusiness.forEach((p, idx) => {
        console.log(`    [${idx + 1}] id=${p.id}, name="${p.name}", isPublished=${p.isPublished}, deletedAt=${p.deletedAt || 'null'}`);
      });
    }

    // Re-fetch stats after creating product3 with test-only cache bypass header
    const response = await testRequest
      .get(`/api/stores/${testStore.id}/stats`)
      .set('Authorization', `Bearer ${testToken}`)
      .set('x-test-no-cache', '1') // Test-only header to bypass cache
      .expect(200);

    expect(response.body.stats.products).toBeGreaterThanOrEqual(3); // testProduct + testProduct2 + product3

    // Clean up
    await prisma.product.delete({ where: { id: product3.id } });
  });
});


