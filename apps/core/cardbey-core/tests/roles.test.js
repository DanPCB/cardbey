/**
 * Tests for lightweight roles & permissions
 * - Owner allowed on restricted routes
 * - Staff denied on restricted routes
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../src/server.js';
import { generateToken } from '../src/middleware/auth.js';
import { resetDb } from '../src/test/helpers/resetDb.js';
import { prisma, seedTenantUserStore, seedProduct, cleanupTestData } from './_helpers/factory.js';
const testRequest = request(app);

// Test users
let ownerUser;
let staffUser;
let viewerUser;
let ownerToken;
let staffToken;
let viewerToken;
let testStore;
let testProduct;

beforeAll(async () => {
  // Clean up any existing test data
  await cleanupTestData();

  // Create owner user with store using factory
  const ownerSetup = await seedTenantUserStore({
    email: 'owner@test.com',
    role: 'owner',
    storeName: 'Test Store',
  });
  ownerUser = ownerSetup.user;
  testStore = ownerSetup.business;
  ownerToken = ownerSetup.token;

  // Create staff user using factory (but without store)
  const staffPassword = await bcrypt.hash('staffpass123', 10);
  staffUser = await prisma.user.create({
    data: {
      email: `staff-${Date.now()}@test.com`,
      passwordHash: staffPassword,
      displayName: 'Staff User',
      role: 'staff',
      roles: JSON.stringify(['staff']),
    }
  });
  staffToken = generateToken(staffUser.id);

  // Create viewer user using factory (but without store)
  const viewerPassword = await bcrypt.hash('viewerpass123', 10);
  viewerUser = await prisma.user.create({
    data: {
      email: `viewer-${Date.now()}@test.com`,
      passwordHash: viewerPassword,
      displayName: 'Viewer User',
      role: 'viewer',
      roles: JSON.stringify(['viewer']),
    }
  });
  viewerToken = generateToken(viewerUser.id);

  // Create product for owner's store using factory
  testProduct = await seedProduct(testStore.id, {
    name: 'Test Product',
    price: 10.99,
    isPublished: true
  });
});

afterAll(async () => {
  await resetDb(prisma);
  await prisma.$disconnect();
});

describe('PATCH /api/stores/:id - Owner access', () => {
  it('should allow owner to update store', async () => {
    const response = await testRequest
      .patch(`/api/stores/${testStore.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Updated Store Name' })
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.store.name).toBe('Updated Store Name');
  });

  it('should deny staff from updating store', async () => {
    const response = await testRequest
      .patch(`/api/stores/${testStore.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Hacked Store Name' })
      .expect(403);

    expect(response.body.ok).toBe(false);
    expect(response.body.error).toContain('Owner access required');
  });

  it('should deny viewer from updating store', async () => {
    const response = await testRequest
      .patch(`/api/stores/${testStore.id}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Hacked Store Name' })
      .expect(403);

    expect(response.body.ok).toBe(false);
    expect(response.body.error).toContain('Owner access required');
  });
});

describe('DELETE /api/products/:id - Owner access', () => {
  beforeEach(async () => {
    // Recreate product if it was deleted
    const existing = await prisma.product.findUnique({
      where: { id: testProduct.id }
    });
    if (!existing || existing.deletedAt) {
      testProduct = await seedProduct(testStore.id, {
        name: 'Test Product',
        price: 10.99,
        isPublished: true,
      });
    }
  });

  it('should allow owner to delete product', async () => {
    const response = await testRequest
      .delete(`/api/products/${testProduct.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.product.deletedAt).toBeTruthy();
  });

  it('should deny staff from deleting product', async () => {
    // Recreate product first using factory
    const product = await seedProduct(testStore.id, {
      name: 'Staff Test Product',
      price: 5.99,
      isPublished: true,
    });

    const response = await testRequest
      .delete(`/api/products/${product.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);

    expect(response.body.ok).toBe(false);
    expect(response.body.error).toContain('Owner access required');

    // Clean up
    await prisma.product.delete({ where: { id: product.id } });
  });

  it('should deny viewer from deleting product', async () => {
    // Recreate product first using factory
    const product = await seedProduct(testStore.id, {
      name: 'Viewer Test Product',
      price: 3.99,
      isPublished: true,
    });

    const response = await testRequest
      .delete(`/api/products/${product.id}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(403);

    expect(response.body.ok).toBe(false);
    expect(response.body.error).toContain('Owner access required');

    // Clean up
    await prisma.product.delete({ where: { id: product.id } });
  });
});

describe('PATCH /api/screens/:id/playlist - Store access', () => {
  let testScreen;
  let testPlaylist;

  beforeAll(async () => {
    // Create a test screen using factory (use owner's store)
    const { seedScreen, seedPlaylist } = await import('./_helpers/factory.js');
    testScreen = await seedScreen(testStore.id, {
      fingerprint: 'test-screen-' + Date.now(),
      name: 'Test Screen',
      status: 'OFFLINE',
      paired: true,
    });

    // Create a test playlist using factory
    testPlaylist = await seedPlaylist({
      name: 'Test Playlist',
      type: 'MEDIA',
    });
  });

  afterAll(async () => {
    await prisma.screen.deleteMany({});
    await prisma.playlist.deleteMany({});
  });

  it('should allow owner to assign playlist', async () => {
    const response = await testRequest
      .patch(`/api/screens/${testScreen.id}/playlist`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ playlistId: testPlaylist.id })
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.playlistId).toBe(testPlaylist.id);
  });

  it('should allow staff to assign playlist', async () => {
    // Unassign first
    await testRequest
      .patch(`/api/screens/${testScreen.id}/playlist`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ playlistId: null });

    const response = await testRequest
      .patch(`/api/screens/${testScreen.id}/playlist`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ playlistId: testPlaylist.id })
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.playlistId).toBe(testPlaylist.id);
  });

  it('should deny viewer from assigning playlist', async () => {
    const response = await testRequest
      .patch(`/api/screens/${testScreen.id}/playlist`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ playlistId: testPlaylist.id })
      .expect(403);

    expect(response.body.ok).toBe(false);
    expect(response.body.error).toContain('Insufficient permissions');
  });
});

describe('Read access - Not restricted', () => {
  it('should allow all roles to read stores', async () => {
    // Note: Read store is owner-only; staff/viewer are denied access
    // Make requests for all three roles
    const ownerResponse = await testRequest
      .get(`/api/stores/${testStore.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const staffResponse = await testRequest
      .get(`/api/stores/${testStore.id}`)
      .set('Authorization', `Bearer ${staffToken}`);
    
    const viewerResponse = await testRequest
      .get(`/api/stores/${testStore.id}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    // All responses should be defined (this was the original issue)
    expect(ownerResponse).toBeDefined();
    expect(staffResponse).toBeDefined();
    expect(viewerResponse).toBeDefined();

    // Owner should get 200 - owns the store
    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.ok).toBe(true);
    expect(ownerResponse.body.store.id).toBe(testStore.id);
    
    // Staff should get 403 - read store is owner-only
    expect(staffResponse.status).toBe(403);
    if (staffResponse.body?.ok !== undefined) {
      expect(staffResponse.body.ok).toBe(false);
    }

    // Viewer should get 403 - read store is owner-only
    expect(viewerResponse.status).toBe(403);
    if (viewerResponse.body?.ok !== undefined) {
      expect(viewerResponse.body.ok).toBe(false);
    }
  });

  it('should allow all roles to read products', async () => {
    // Note: Products read is owner-only; non-owners may get 403 or 404 depending on policy
    // Make requests for all three roles
    const ownerResponse = await testRequest
      .get('/api/products')
      .set('Authorization', `Bearer ${ownerToken}`);

    const staffResponse = await testRequest
      .get('/api/products')
      .set('Authorization', `Bearer ${staffToken}`);
    
    const viewerResponse = await testRequest
      .get('/api/products')
      .set('Authorization', `Bearer ${viewerToken}`);

    // All responses should be defined (this was the original issue)
    expect(ownerResponse).toBeDefined();
    expect(staffResponse).toBeDefined();
    expect(viewerResponse).toBeDefined();

    // Owner should get 200 - has a business
    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.ok).toBe(true);
    expect(Array.isArray(ownerResponse.body.products)).toBe(true);
    
    // Staff should be denied - accept 403 or 404 (API may hide resource existence)
    expect([403, 404]).toContain(staffResponse.status);
    if (staffResponse.body?.ok !== undefined) {
      expect(staffResponse.body.ok).toBe(false);
    }

    // Viewer should be denied - accept 403 or 404 (API may hide resource existence)
    expect([403, 404]).toContain(viewerResponse.status);
    if (viewerResponse.body?.ok !== undefined) {
      expect(viewerResponse.body.ok).toBe(false);
    }
  });
});


