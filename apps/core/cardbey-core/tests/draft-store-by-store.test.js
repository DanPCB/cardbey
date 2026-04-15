/**
 * Tests for GET /api/draft-store/by-store/:storeId and POST /api/draft-store/create-from-store.
 * - GET by-store returns 404 when no draft
 * - POST create-from-store creates a draft; subsequent GET by-store returns it
 * - 401 when not authenticated; 403 when store belongs to another user (tenant mismatch)
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';

const prisma = new PrismaClient();
const testRequest = request(app);
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-this';

process.env.NODE_ENV = 'test';

describe('Draft store by-store and create-from-store', () => {
  let userA;
  let userB;
  let storeA;
  let tokenA;
  let tokenB;

  beforeEach(async () => {
    await resetDb(prisma);

    userA = await prisma.user.create({
      data: {
        email: 'user-a@test.com',
        passwordHash: 'hash',
        displayName: 'User A',
        roles: '["viewer"]',
      },
    });
    userB = await prisma.user.create({
      data: {
        email: 'user-b@test.com',
        passwordHash: 'hash',
        displayName: 'User B',
        roles: '["viewer"]',
      },
    });

    storeA = await prisma.business.create({
      data: {
        userId: userA.id,
        name: 'Store A',
        type: 'General',
        slug: 'store-a-' + Date.now(),
      },
    });

    tokenA = jwt.sign({ userId: userA.id }, JWT_SECRET);
    tokenB = jwt.sign({ userId: userB.id }, JWT_SECRET);
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('GET /api/draft-store/by-store/:storeId returns 404 when no draft exists', async () => {
    const res = await testRequest
      .get(`/api/draft-store/by-store/${storeA.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);

    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('draft_not_found');
    expect(res.body.message).toMatch(/no draft/i);
  });

  it('GET /api/draft-store/by-store/:storeId returns 401 when not authenticated', async () => {
    await testRequest
      .get(`/api/draft-store/by-store/${storeA.id}`)
      .expect(401);
  });

  it('GET /api/draft-store/by-store/:storeId returns 403 when store belongs to another user', async () => {
    const res = await testRequest
      .get(`/api/draft-store/by-store/${storeA.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);

    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('forbidden');
  });

  it('POST /api/draft-store/create-from-store creates draft; GET by-store returns it', async () => {
    const createRes = await testRequest
      .post('/api/draft-store/create-from-store')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ storeId: storeA.id })
      .expect(201);

    expect(createRes.body.ok).toBe(true);
    expect(createRes.body.draftId).toBeDefined();
    expect(createRes.body.storeId).toBe(storeA.id);
    expect(createRes.body.status).toBe('ready');

    const getRes = await testRequest
      .get(`/api/draft-store/by-store/${storeA.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(getRes.body.ok).toBe(true);
    expect(getRes.body.draftId).toBe(createRes.body.draftId);
    expect(getRes.body.storeId).toBe(storeA.id);
    expect(getRes.body.status).toBe('ready');
    expect(getRes.body.preview).toBeDefined();
    expect(getRes.body.preview.storeName).toBe('Store A');
    expect(Array.isArray(getRes.body.preview.categories)).toBe(true);
    expect(Array.isArray(getRes.body.preview.items)).toBe(true);
  });

  it('POST /api/draft-store/create-from-store returns 401 when not authenticated', async () => {
    await testRequest
      .post('/api/draft-store/create-from-store')
      .send({ storeId: storeA.id })
      .expect(401);
  });

  it('POST /api/draft-store/create-from-store returns 403 when store belongs to another user', async () => {
    const res = await testRequest
      .post('/api/draft-store/create-from-store')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ storeId: storeA.id })
      .expect(403);

    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('forbidden');
  });

  it('POST /api/draft-store/create-from-store returns 404 when store does not exist', async () => {
    const res = await testRequest
      .post('/api/draft-store/create-from-store')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ storeId: 'non-existent-store-id' })
      .expect(404);

    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('store_not_found');
  });

  describe('PATCH /api/draft-store/:draftId ownership', () => {
    it('create-from-store draft: PATCH succeeds for store owner (200)', async () => {
      const createRes = await testRequest
        .post('/api/draft-store/create-from-store')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ storeId: storeA.id })
        .expect(201);
      const draftId = createRes.body.draftId;

      const patchRes = await testRequest
        .patch(`/api/draft-store/${draftId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ preview: { storeName: 'Updated Store Name' } })
        .expect(200);

      expect(patchRes.body.ok).toBe(true);
      expect(patchRes.body.draftId).toBe(draftId);
      expect(patchRes.body.preview?.storeName).toBe('Updated Store Name');
    });

    it('create-from-store draft: PATCH forbidden for another user (403)', async () => {
      const createRes = await testRequest
        .post('/api/draft-store/create-from-store')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ storeId: storeA.id })
        .expect(201);
      const draftId = createRes.body.draftId;

      const res = await testRequest
        .patch(`/api/draft-store/${draftId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ preview: { storeName: 'Hacked Name' } })
        .expect(403);

      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('forbidden');
    });

    it('orchestra-style draft with generationRunId: PATCH 200 for task owner, 403 for other user', async () => {
      const runId = 'patch-ownership-run-' + Date.now();
      await prisma.orchestratorTask.create({
        data: {
          entryPoint: 'build_store',
          tenantId: userA.id,
          userId: userA.id,
          status: 'completed',
          request: { generationRunId: runId, storeId: 'temp', goal: 'build_store' },
          result: { ok: true, generationRunId: runId },
        },
      });
      const draft = await prisma.draftStore.create({
        data: {
          mode: 'ai',
          status: 'ready',
          generationRunId: runId,
          input: { generationRunId: runId },
          preview: { storeName: 'Orchestra Store', meta: { storeName: 'Orchestra Store', storeType: 'General' } },
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await testRequest
        .patch(`/api/draft-store/${draft.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ preview: { storeName: 'Updated by Owner' } })
        .expect(200);

      const res = await testRequest
        .patch(`/api/draft-store/${draft.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ preview: { storeName: 'Updated by Other' } })
        .expect(403);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('forbidden');
    });
  });
});
