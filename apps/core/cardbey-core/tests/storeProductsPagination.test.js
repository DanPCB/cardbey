/**
 * Paginated store product APIs:
 * - GET /api/public/stores/:slug/products
 * - GET /api/stores/:storeId/products
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';
import { categoryNameToId } from '../src/lib/listStoreProducts.js';

const prisma = new PrismaClient();
const testRequest = request(app);

describe('store products pagination APIs', () => {
  let testUser;
  let store;
  let authToken;
  const drinksCategoryId = categoryNameToId('Drinks');

  beforeEach(async () => {
    await resetDb(prisma);

    testUser = await prisma.user.create({
      data: {
        email: 'products-pagination@test.com',
        passwordHash: 'hash',
        displayName: 'Products Pagination',
        roles: '["viewer"]',
      },
    });

    store = await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Pagination Test Cafe',
        type: 'cafe',
        slug: 'pagination-test-cafe',
        description: 'Test store',
        isActive: true,
      },
    });

    const products = [];
    for (let i = 0; i < 55; i++) {
      const isDrinks = i < 20;
      products.push({
        businessId: store.id,
        name: isDrinks ? `Drink ${i + 1}` : `Food ${i + 1}`,
        description: 'Test item',
        price: 9.5 + i,
        category: isDrinks ? 'Drinks' : 'Mains',
        isPublished: true,
      });
    }
    await prisma.product.createMany({ data: products });

    authToken = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this',
    );
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('GET /api/public/stores/:slug/products returns default limit 50', async () => {
    const res = await testRequest
      .get('/api/public/stores/pagination-test-cafe/products')
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.storeId).toBe(store.id);
    expect(res.body.products).toHaveLength(50);
    expect(res.body.total).toBe(55);
    expect(res.body.limit).toBe(50);
    expect(res.body.offset).toBe(0);
    expect(res.body.hasMore).toBe(true);
  });

  it('GET /api/public/stores/:slug/products supports offset pagination', async () => {
    const res = await testRequest
      .get('/api/public/stores/pagination-test-cafe/products?offset=50&limit=50')
      .expect(200);

    expect(res.body.products).toHaveLength(5);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.offset).toBe(50);
  });

  it('GET /api/public/stores/:slug/products filters by categoryId', async () => {
    const res = await testRequest
      .get(`/api/public/stores/pagination-test-cafe/products?categoryId=${encodeURIComponent(drinksCategoryId)}&limit=300`)
      .expect(200);

    expect(res.body.total).toBe(20);
    expect(res.body.products.length).toBe(20);
    expect(res.body.products.every((p) => p.categoryId === drinksCategoryId)).toBe(true);
  });

  it('GET /api/public/stores/:slug/products caps limit at 300', async () => {
    const res = await testRequest
      .get('/api/public/stores/pagination-test-cafe/products?limit=999')
      .expect(200);

    expect(res.body.limit).toBe(300);
  });

  it('GET /api/stores/:storeId/products requires auth and returns all non-deleted products', async () => {
    await prisma.product.create({
      data: {
        businessId: store.id,
        name: 'Draft Only Item',
        price: 1,
        category: 'Mains',
        isPublished: false,
      },
    });

    const res = await testRequest
      .get(`/api/stores/${store.id}/products?limit=300`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.total).toBe(56);
    expect(res.body.products.some((p) => p.name === 'Draft Only Item')).toBe(true);
  });

  it('GET /api/stores/:storeId/products returns 403 for non-owner', async () => {
    const other = await prisma.user.create({
      data: {
        email: 'other-user@test.com',
        passwordHash: 'hash',
        displayName: 'Other',
        roles: '["viewer"]',
      },
    });
    const otherToken = jwt.sign(
      { userId: other.id },
      process.env.JWT_SECRET || 'default-secret-change-this',
    );

    await testRequest
      .get(`/api/stores/${store.id}/products`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });
});
