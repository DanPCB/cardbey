import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';

const prisma = new PrismaClient();
const testRequest = request(app);

describe('Store routes - Phase 1 fields', () => {
  let testUser;
  let testStore;

  beforeEach(async () => {
    await resetDb(prisma);

    // Create a test user
    testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        passwordHash: 'test-hash',
        displayName: 'Test User',
        roles: '["viewer"]'
      }
    });

    // Create a test store
    testStore = await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Test Store',
        type: 'General',
        slug: 'test-store',
        description: 'Test description',
        isActive: true
      }
    });
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('GET /api/stores/:id - fetches store with all fields including new Phase 1 fields', async () => {
    // Generate a JWT token for the test user
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    const res = await testRequest
      .get(`/api/stores/${testStore.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.store).toBeDefined();
    expect(res.body.store.id).toBe(testStore.id);
    expect(res.body.store.name).toBe('Test Store');
    
    // Verify new Phase 1 fields are present (even if null)
    expect(res.body.store).toHaveProperty('tradingHours');
    expect(res.body.store).toHaveProperty('address');
    expect(res.body.store).toHaveProperty('suburb');
    expect(res.body.store).toHaveProperty('postcode');
    expect(res.body.store).toHaveProperty('country');
    expect(res.body.store).toHaveProperty('phone');
    expect(res.body.store).toHaveProperty('lat');
    expect(res.body.store).toHaveProperty('lng');
  });

  it('PATCH /api/stores/:id - updates store with new Phase 1 fields', async () => {
    // Generate a JWT token for the test user
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    const updateData = {
      address: '123 Main St',
      suburb: 'Downtown',
      postcode: '12345',
      country: 'USA',
      phone: '+1-555-1234',
      lat: 40.7128,
      lng: -74.0060,
      tradingHours: {
        monday: { open: '09:00', close: '17:00' },
        tuesday: { open: '09:00', close: '17:00' }
      }
    };

    const res = await testRequest
      .patch(`/api/stores/${testStore.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(updateData)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.store).toBeDefined();
    expect(res.body.store.address).toBe('123 Main St');
    expect(res.body.store.suburb).toBe('Downtown');
    expect(res.body.store.postcode).toBe('12345');
    expect(res.body.store.country).toBe('USA');
    expect(res.body.store.phone).toBe('+1-555-1234');
    expect(res.body.store.lat).toBe(40.7128);
    expect(res.body.store.lng).toBe(-74.0060);
    expect(res.body.store.tradingHours).toEqual(updateData.tradingHours);
  });

  it('PATCH /api/stores/:id - supports partial updates (only provided fields)', async () => {
    // Generate a JWT token for the test user
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    // First, set some initial values
    await prisma.business.update({
      where: { id: testStore.id },
      data: {
        address: 'Initial Address',
        phone: '123-456-7890'
      }
    });

    // Update only address, phone should remain unchanged
    const res = await testRequest
      .patch(`/api/stores/${testStore.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        address: 'Updated Address'
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.store.address).toBe('Updated Address');
    expect(res.body.store.phone).toBe('123-456-7890'); // Should remain unchanged
  });

  it('PATCH /api/stores/:id - validates lat/lng ranges', async () => {
    // Generate a JWT token for the test user
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    // Test invalid lat (too high)
    const res1 = await testRequest
      .patch(`/api/stores/${testStore.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ lat: 91 })
      .expect(400);

    expect(res1.body.ok).toBe(false);
    expect(res1.body.error).toBe('Validation error');

    // Test invalid lng (too low)
    const res2 = await testRequest
      .patch(`/api/stores/${testStore.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ lng: -181 })
      .expect(400);

    expect(res2.body.ok).toBe(false);
    expect(res2.body.error).toBe('Validation error');
  });

  it('PATCH /api/stores/:id - allows setting fields to null', async () => {
    // Generate a JWT token for the test user
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    // First set some values
    await prisma.business.update({
      where: { id: testStore.id },
      data: {
        address: 'Some Address',
        phone: '123-456-7890'
      }
    });

    // Then set them to null
    const res = await testRequest
      .patch(`/api/stores/${testStore.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        address: null,
        phone: null
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.store.address).toBeNull();
    expect(res.body.store.phone).toBeNull();
  });

  it('GET /api/stores - returns stores with new Phase 1 fields', async () => {
    // Generate a JWT token for the test user
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );

    const res = await testRequest
      .get('/api/stores')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.stores)).toBe(true);
    expect(res.body.stores.length).toBeGreaterThan(0);
    
    const store = res.body.stores[0];
    expect(store).toHaveProperty('tradingHours');
    expect(store).toHaveProperty('address');
    expect(store).toHaveProperty('suburb');
    expect(store).toHaveProperty('postcode');
    expect(store).toHaveProperty('country');
    expect(store).toHaveProperty('phone');
    expect(store).toHaveProperty('lat');
    expect(store).toHaveProperty('lng');
  });
});



