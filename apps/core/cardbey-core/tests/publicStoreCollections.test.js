/**
 * GET /api/public/stores/collections
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';
import { CURATED_COLLECTIONS } from '../src/config/curatedCollections.js';

const prisma = new PrismaClient();
const testRequest = request(app);

describe('GET /api/public/stores/collections', () => {
  let testUser;

  beforeEach(async () => {
    await resetDb(prisma);
    testUser = await prisma.user.create({
      data: {
        email: 'collections-test@example.com',
        passwordHash: 'hash',
        displayName: 'Collections Test User',
        roles: '["viewer"]',
      },
    });

    for (let i = 0; i < 3; i += 1) {
      await prisma.business.create({
        data: {
          userId: testUser.id,
          name: `Braybrook Cafe ${i + 1}`,
          type: 'cafe',
          slug: `braybrook-cafe-${i + 1}`,
          suburb: 'Braybrook',
          isActive: true,
        },
      });
    }
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('returns collections meeting minStoreCount', async () => {
    const res = await testRequest.get('/api/public/stores/collections').expect(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.collections)).toBe(true);
    const braybrook = res.body.collections.find((c) => c.id === 'braybrook-food');
    expect(braybrook).toMatchObject({
      id: 'braybrook-food',
      title: 'Braybrook food trail',
      count: 3,
      filters: { suburb: 'Braybrook', category: 'food' },
    });
  });

  it('scopes collection counts when suburb query is set', async () => {
    await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Fitzroy Shop',
        type: 'retail',
        slug: 'fitzroy-shop-collections',
        suburb: 'Fitzroy',
        isActive: true,
      },
    });

    const scoped = await testRequest
      .get('/api/public/stores/collections?suburb=Braybrook')
      .expect(200);
    const braybrook = scoped.body.collections.find((c) => c.id === 'braybrook-food');
    expect(braybrook?.count).toBe(3);
    expect(scoped.body.collections.some((c) => c.filters?.suburb === 'Fitzroy')).toBe(false);
  });

  it('config includes expected editorial presets', () => {
    expect(CURATED_COLLECTIONS.some((c) => c.id === 'new-this-month')).toBe(true);
  });
});
