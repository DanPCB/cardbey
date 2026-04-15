/**
 * MI Tool Contract v1 routes (read-only + 501 placeholders).
 * - POST /mi/v1/store/get-public returns ok:true and store for published store.
 * - POST /mi/v1/catalog/list returns ok:true and items array.
 * - POST /mi/v1/booking/confirm returns 501 with standard envelope.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';
import prisma from '../src/lib/prisma.js';

const testRequest = request(app);

const miBody = (input, requestId = 'test-req-1') => ({
  requestId,
  actor: { role: 'buyer', userId: null, sessionId: null },
  context: { channel: 'api', locale: 'en', currency: 'USD', timezone: 'UTC' },
  input: input ?? {},
});

describe('MI Tool Contract v1', () => {
  let testUser;
  let testStore;

  beforeEach(async () => {
    await resetDb(prisma);

    testUser = await prisma.user.create({
      data: {
        email: 'mi-tools-test@example.com',
        passwordHash: 'hash',
        displayName: 'MI Test User',
        roles: '["viewer"]',
      },
    });

    testStore = await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'MI Test Store',
        type: 'retail',
        slug: 'mi-test-store',
        description: 'For MI tests',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await resetDb(prisma);
  });

  it('POST /mi/v1/store/get-public returns ok:true and store for published store', async () => {
    const res = await testRequest
      .post('/mi/v1/store/get-public')
      .send(miBody({ storeIdOrSlug: testStore.id }))
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.store).toBeDefined();
    expect(res.body.data.store.storeId).toBe(testStore.id);
    expect(res.body.data.store.name).toBe('MI Test Store');
    expect(res.body.requestId).toBe('test-req-1');
  });

  it('POST /mi/v1/store/get-public by slug returns same store', async () => {
    const res = await testRequest
      .post('/mi/v1/store/get-public')
      .send(miBody({ storeIdOrSlug: 'mi-test-store' }))
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.store.storeId).toBe(testStore.id);
    expect(res.body.data.store.slug).toBe('mi-test-store');
  });

  it('POST /mi/v1/store/get-public returns NOT_FOUND for unknown id', async () => {
    const res = await testRequest
      .post('/mi/v1/store/get-public')
      .send(miBody({ storeIdOrSlug: 'nonexistent-id' }))
      .expect(404);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('POST /mi/v1/catalog/list returns ok:true and items array', async () => {
    const res = await testRequest
      .post('/mi/v1/catalog/list')
      .send(miBody({ storeId: testStore.id }))
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(Array.isArray(res.body.data.categories)).toBe(true);
  });

  it('POST /mi/v1/catalog/list with products returns items', async () => {
    await prisma.product.create({
      data: {
        businessId: testStore.id,
        name: 'Test Product',
        price: 10.5,
        currency: 'USD',
        category: 'General',
        isPublished: true,
      },
    });
    const res = await testRequest
      .post('/mi/v1/catalog/list')
      .send(miBody({ storeId: testStore.id }))
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.items.length).toBe(1);
    expect(res.body.data.items[0].title).toBe('Test Product');
    expect(res.body.data.items[0].price.amount).toBe(1050); // minor units
  });

  it('POST /mi/v1/booking/confirm returns 501 with envelope', async () => {
    const res = await testRequest
      .post('/mi/v1/booking/confirm')
      .send(miBody({}, 'booking-req'))
      .expect(501);
    expect(res.body.ok).toBe(false);
    expect(res.body.requestId).toBe('booking-req');
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('TEMPORARY_UNAVAILABLE');
  });

  it('GET /mi/openapi.yaml returns YAML spec', async () => {
    const res = await testRequest.get('/mi/openapi.yaml').expect(200);
    expect(res.headers['content-type']).toMatch(/yaml/);
    expect(res.text).toContain('openapi:');
    expect(res.text).toContain('Cardbey MI Tool Contract');
  });
});
