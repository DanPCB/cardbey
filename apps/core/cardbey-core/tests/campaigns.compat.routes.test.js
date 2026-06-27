/**
 * Legacy GET /api/campaigns compatibility routes.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';

const prisma = new PrismaClient();
const testRequest = request(app);

describe('GET /api/campaigns (compat)', () => {
  let testUser;
  let jwt;

  beforeEach(async () => {
    await resetDb(prisma);
    testUser = await prisma.user.create({
      data: {
        email: 'campaigns-test@example.com',
        passwordHash: 'hash',
        displayName: 'Campaigns Test',
        roles: '[]',
      },
    });
    const token = (await import('jsonwebtoken')).default;
    jwt = token.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this',
    );
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('returns 401 without auth', async () => {
    const res = await testRequest.get('/api/campaigns?limit=10');
    expect(res.status).toBe(401);
  });

  it('returns ok + items array for authenticated user', async () => {
    const plan = await prisma.campaignPlan.create({
      data: {
        tenantKey: testUser.id,
        objective: 'Weekend promo',
        status: 'validated',
      },
    });
    await prisma.campaignV2.create({
      data: {
        tenantKey: testUser.id,
        planId: plan.id,
        title: 'Summer Sale',
        objective: 'Weekend promo',
        status: 'SCHEDULED',
      },
    });

    const res = await testRequest
      .get('/api/campaigns?limit=10')
      .set('Authorization', `Bearer ${jwt}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].name).toBe('Summer Sale');
    expect(res.body.items[0].status).toBe('active');
  });
});
