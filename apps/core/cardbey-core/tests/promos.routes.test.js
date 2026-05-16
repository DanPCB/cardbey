/**
 * Smart Promo + QR routes.
 * - Slug generation: collision retry.
 * - POST /api/promos requires auth; creates promo with slug.
 * - GET /api/public/promos/:slug returns safe fields; 404 when missing.
 * - POST /api/public/promos/:slug/scan increments scanCount.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/server.js';
import { generateShortSlug, generateUniqueShortSlug } from '../src/utils/shortSlug.js';
import { resetDb } from '../src/test/helpers/resetDb.js';

const prisma = new PrismaClient();
const testRequest = request(app);

describe('shortSlug', () => {
  it('generateShortSlug returns fixed-length alphanumeric string', () => {
    const slug = generateShortSlug(8);
    expect(slug).toMatch(/^[a-z0-9]{8}$/);
    expect(generateShortSlug(6)).toMatch(/^[a-z0-9]{6}$/);
  });

  it('generateUniqueShortSlug retries on collision', async () => {
    await resetDb(prisma);
    const user = await prisma.user.create({
      data: { email: 'u@t.com', passwordHash: 'h', displayName: 'U', roles: '[]' },
    });
    const biz = await prisma.business.create({
      data: { userId: user.id, name: 'B', type: 'G', slug: 'b', isActive: true },
    });
    const existingSlug = 'aaaaaaaa';
    await prisma.storePromo.create({
      data: {
        storeId: biz.id,
        title: 'T',
        slug: existingSlug,
        targetUrl: `/feed/${biz.slug}`,
      },
    });
    const slug = await generateUniqueShortSlug(prisma, 8, 3);
    expect(slug).toBeDefined();
    expect(slug).not.toBe(existingSlug);
    await resetDb(prisma);
  });
});

describe('Promo routes (Smart Promo + QR)', () => {
  let testUser;
  let testStore;
  let testPromo;
  let jwt;

  beforeEach(async () => {
    await resetDb(prisma);

    testUser = await prisma.user.create({
      data: {
        email: 'promo-test@example.com',
        passwordHash: 'hash',
        displayName: 'Promo Test',
        roles: '["viewer"]',
      },
    });

    testStore = await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Promo Store',
        type: 'General',
        slug: 'promo-store',
        isActive: true,
      },
    });

    testPromo = await prisma.storePromo.create({
      data: {
        storeId: testStore.id,
        title: '10% Off',
        description: 'First order',
        code: 'SAVE10',
        slug: 'abc12xyz',
        targetUrl: '/feed/promo-store',
        isActive: true,
        scanCount: 0,
      },
    });

    const token = (await import('jsonwebtoken')).default;
    jwt = token.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('POST /api/promos requires auth (401 without token)', async () => {
    const res = await testRequest
      .post('/api/promos')
      .send({ storeId: testStore.id, title: 'Test' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(401);
  });

  it('POST /api/promos creates promo with slug and returns it', async () => {
    const res = await testRequest
      .post('/api/promos')
      .set('Authorization', `Bearer ${jwt}`)
      .set('Content-Type', 'application/json')
      .send({
        storeId: testStore.id,
        title: 'New Promo',
        subtitle: 'Sub',
        couponCode: 'CODE1',
      });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.promo).toBeDefined();
    expect(res.body.promo.title).toBe('New Promo');
    expect(res.body.promo.slug).toBeDefined();
    expect(res.body.promo.slug.length).toBeGreaterThanOrEqual(8);
    expect(res.body.promo.scanCount).toBe(0);
  });

  it('GET /api/public/promos/:slug returns public safe fields when promo exists', async () => {
    const res = await testRequest.get(`/api/public/promos/${testPromo.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.promo).toBeDefined();
    expect(res.body.promo.slug).toBe(testPromo.slug);
    expect(res.body.promo.title).toBe('10% Off');
    expect(res.body.promo.description).toBe('First order');
    expect(res.body.promo.couponCode).toBe('SAVE10');
    expect(res.body.promo.storeId).toBe(testStore.id);
    expect(res.body.promo.storeName).toBe('Promo Store');
    expect(res.body.promo.storeSlug).toBe('promo-store');
    expect(res.body.promo.targetUrl).toBeDefined();
  });

  it('GET /api/public/promos/:slug returns 404 when slug missing', async () => {
    const res = await testRequest.get('/api/public/promos/nonexistent');
    expect(res.status).toBe(404);
  });

  it('POST /api/public/promos/:slug/scan increments scanCount', async () => {
    const before = await prisma.storePromo.findUnique({ where: { id: testPromo.id } });
    const res = await testRequest.post(`/api/public/promos/${testPromo.slug}/scan`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const after = await prisma.storePromo.findUnique({ where: { id: testPromo.id } });
    expect(after.scanCount).toBe(before.scanCount + 1);
  });
});
