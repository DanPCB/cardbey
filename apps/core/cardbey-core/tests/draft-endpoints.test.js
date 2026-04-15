/**
 * Integration tests for draft alias endpoints.
 * Ensures GET /api/stores/temp/draft and GET /api/public/store/temp/draft
 * always return 200 (never 404) with ok === true and status in allowed set.
 * Use NODE_ENV=test; no OpenAI required.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';
import prisma from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

const testRequest = request(app);
const ALLOWED_STATUSES = ['ready', 'generating', 'not_found', 'failed'];

process.env.NODE_ENV = 'test';

describe('Draft alias endpoints (no 404)', () => {
  let testUser;
  let authToken;

  beforeEach(async () => {
    await resetDb(prisma);

    testUser = await prisma.user.create({
      data: {
        email: 'draft-test@example.com',
        passwordHash: 'test-hash',
        displayName: 'Draft Test User',
        roles: '["owner"]',
        role: 'owner',
      },
    });

    authToken = generateToken(testUser.id);
  });

  afterAll(async () => {
    await resetDb(prisma);
  });

  it('GET /api/stores/temp/draft returns 200 with ok and valid status (never 404)', async () => {
    const res = await testRequest
      .get('/api/stores/temp/draft')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(ALLOWED_STATUSES).toContain(res.body.status);
    expect(res.body.storeId).toBe('temp');
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(Array.isArray(res.body.categories)).toBe(true);
  });

  it('GET /api/stores/temp/draft?generationRunId=gen-xxx returns 200 (never 404)', async () => {
    const res = await testRequest
      .get('/api/stores/temp/draft?generationRunId=gen-xxx')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(ALLOWED_STATUSES).toContain(res.body.status);
  });

  it('GET /api/public/store/temp/draft returns 200 with ok and valid status (never 404)', async () => {
    const res = await testRequest
      .get('/api/public/store/temp/draft')
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(ALLOWED_STATUSES).toContain(res.body.status);
    expect(res.body.storeId).toBe('temp');
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(Array.isArray(res.body.categories)).toBe(true);
  });

  it('GET /api/public/store/temp/draft?generationRunId=gen-yyy returns 200 (never 404)', async () => {
    const res = await testRequest
      .get('/api/public/store/temp/draft?generationRunId=gen-yyy')
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(ALLOWED_STATUSES).toContain(res.body.status);
  });

  /** Exact keys required: same as GET /api/stores/:storeId/draft (DraftResponse contract). Phase 0: qaReport optional. */
  const DRAFT_RESPONSE_REQUIRED_KEYS = ['ok', 'storeId', 'generationRunId', 'status', 'draftId', 'draft', 'store', 'products', 'categories', 'qaReport'];

  function assertDraftResponseContract(body) {
    for (const key of DRAFT_RESPONSE_REQUIRED_KEYS) {
      expect(body).toHaveProperty(key);
    }
    expect(typeof body.ok).toBe('boolean');
    expect(typeof body.status).toBe('string');
    expect(ALLOWED_STATUSES).toContain(body.status);
    expect(typeof body.draftId).toBe('string');
    expect(body.generationRunId === null || typeof body.generationRunId === 'string').toBe(true);
    expect(body.store).toBeDefined();
    expect(typeof body.store).toBe('object');
    expect(typeof body.store.id).toBe('string');
    expect(Array.isArray(body.products)).toBe(true);
    expect(Array.isArray(body.categories)).toBe(true);
  }

  it('GET /api/stores/temp/draft?generationRunId=gen-x returns 200 and exact DraftResponse shape', async () => {
    const res = await testRequest
      .get('/api/stores/temp/draft?generationRunId=gen-x')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    assertDraftResponseContract(res.body);
  });

  it('GET /api/public/store/temp/draft?generationRunId=gen-x returns 200 and same DraftResponse shape', async () => {
    const res = await testRequest
      .get('/api/public/store/temp/draft?generationRunId=gen-x')
      .expect(200);

    assertDraftResponseContract(res.body);
  });

  it('GET /api/public/store/temp/draft without generationRunId returns 200 with status not_found when no drafts exist', async () => {
    await prisma.draftStore.deleteMany({});
    const res = await testRequest
      .get('/api/public/store/temp/draft')
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe('not_found');
    expect(res.body.storeId).toBe('temp');
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(Array.isArray(res.body.categories)).toBe(true);
  });

  it('GET /api/public/store/temp/draft with seeded DraftStore returns ok:true, qaReport when present', async () => {
    const runId = 'test-public-draft-run-' + Date.now();
    await prisma.draftStore.create({
      data: {
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        mode: 'ai',
        status: 'ready',
        input: { storeId: 'temp', generationRunId: runId },
        preview: {
          storeName: 'Test Store',
          storeType: 'General',
          items: [{ id: 'p1', name: 'Product 1', price: 10 }],
          categories: [{ id: 'c1', name: 'Category 1' }],
          meta: {
            qaReport: { totalItems: 1, itemsWithImages: 0, score: 40, computedAt: new Date().toISOString() },
          },
        },
        committedStoreId: null,
      },
    });

    const res = await testRequest
      .get(`/api/public/store/temp/draft?generationRunId=${runId}`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.storeId).toBe('temp');
    expect(res.body.generationRunId).toBe(runId);
    expect(res.body.status).toBe('ready');
    expect(res.body).toHaveProperty('draftId');
    expect(res.body).toHaveProperty('draft');
    expect(res.body).toHaveProperty('store');
    expect(res.body).toHaveProperty('products');
    expect(res.body).toHaveProperty('categories');
    expect(res.body).toHaveProperty('qaReport');
    expect(res.body.qaReport).toHaveProperty('totalItems', 1);
    expect(res.body.qaReport).toHaveProperty('score', 40);
  });
});
