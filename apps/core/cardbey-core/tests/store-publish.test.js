/**
 * Store publish endpoint: auth handling and guest/dev behavior.
 * - 401 with code AUTH_REQUIRED when user does not exist (e.g. dev token without dev user)
 * - 401 with code AUTH_REQUIRED when guest token in production
 * - 200 when guest token in dev/test (auto-provisioned User) or when real user + draft exist
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';

const prisma = new PrismaClient();
const testRequest = request(app);

process.env.NODE_ENV = 'test';

describe('POST /api/stores/publish', () => {
  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('returns 401 with code AUTH_REQUIRED or user_not_found when user does not exist in DB', async () => {
    const runId = 'publish-test-run-401';
    await prisma.draftStore.create({
      data: {
        mode: 'ai',
        status: 'ready',
        generationRunId: runId,
        input: { generationRunId: runId },
        preview: { storeName: 'Test Store', meta: { storeName: 'Test Store', storeType: 'General' } },
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const res = await testRequest
      .post('/api/stores/publish')
      .set('Authorization', 'Bearer dev-admin-token')
      .send({ storeId: 'temp', generationRunId: runId })
      .expect(401);
    expect(res.body.ok).toBe(false);
    expect(['AUTH_REQUIRED', 'user_not_found']).toContain(res.body.code);
    expect(res.body.error).toBeDefined();
    expect(res.body.message).toMatch(/sign in|user not found/i);
  });

  it('returns 401 with code AUTH_REQUIRED when guest token is used in production', async () => {
    const runId = 'publish-test-run-guest-prod';
    await prisma.draftStore.create({
      data: {
        mode: 'ai',
        status: 'ready',
        generationRunId: runId,
        input: { generationRunId: runId },
        preview: { storeName: 'Test Store', meta: { storeName: 'Test Store', storeType: 'General' } },
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const jwt = require('jsonwebtoken');
    const guestToken = jwt.sign(
      { userId: 'guest_7b52a5cd-test', role: 'guest', auth: 'guest' },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await testRequest
        .post('/api/stores/publish')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ storeId: 'temp', generationRunId: runId })
        .expect(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.code).toBe('AUTH_REQUIRED');
      expect(res.body.message).toMatch(/sign in|create an account/i);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('returns 200 and creates business when guest token in dev/test (auto-provision)', async () => {
    const runId = 'publish-test-run-guest-dev';
    await prisma.draftStore.create({
      data: {
        mode: 'ai',
        status: 'ready',
        generationRunId: runId,
        input: { generationRunId: runId },
        preview: {
          storeName: 'Guest Store',
          meta: { storeName: 'Guest Store', storeType: 'General' },
          catalog: { products: [], categories: [] },
        },
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const jwt = require('jsonwebtoken');
    const guestToken = jwt.sign(
      { userId: 'guest_7b52a5cd-dev', role: 'guest', auth: 'guest' },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );
    const res = await testRequest
      .post('/api/stores/publish')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ storeId: 'temp', generationRunId: runId })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.publishedStoreId).toBeDefined();
    expect(res.body.publishedAt).toBeDefined();
    const business = await prisma.business.findUnique({
      where: { id: res.body.publishedStoreId },
      include: { user: true },
    });
    expect(business).toBeDefined();
    expect(business.user.email).toBe('guest-guest_7b52a5cd-dev@cardbey.local');
  });

  it('returns 200 and creates business when user and draft exist', async () => {
    const testUser = await prisma.user.create({
      data: {
        email: 'publish-success@example.com',
        passwordHash: 'test-hash',
        displayName: 'Publish Test',
        roles: '["viewer"]',
      },
    });
    const runId = 'publish-test-run-200';
    await prisma.draftStore.create({
      data: {
        mode: 'ai',
        status: 'ready',
        generationRunId: runId,
        input: { generationRunId: runId },
        preview: {
          storeName: 'My Published Store',
          meta: { storeName: 'My Published Store', storeType: 'General' },
          catalog: { products: [], categories: [] },
        },
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );
    const res = await testRequest
      .post('/api/stores/publish')
      .set('Authorization', `Bearer ${token}`)
      .send({ storeId: 'temp', generationRunId: runId })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.publishedStoreId).toBeDefined();
    expect(res.body.publishedAt).toBeDefined();
    const business = await prisma.business.findUnique({
      where: { id: res.body.publishedStoreId },
    });
    expect(business).toBeDefined();
    expect(business.userId).toBe(testUser.id);
  });

  it('copies hero and avatar from draft to Business on publish', async () => {
    const testUser = await prisma.user.create({
      data: {
        email: 'publish-hero-avatar@example.com',
        passwordHash: 'test-hash',
        displayName: 'Hero Avatar Test',
        roles: '["viewer"]',
      },
    });
    const runId = 'publish-test-run-hero-avatar';
    const heroUrl = 'https://example.com/hero.jpg';
    const avatarUrl = 'https://example.com/avatar.jpg';
    await prisma.draftStore.create({
      data: {
        mode: 'ai',
        status: 'ready',
        generationRunId: runId,
        input: { generationRunId: runId },
        preview: {
          storeName: 'Store With Hero',
          meta: {
            storeName: 'Store With Hero',
            storeType: 'General',
            profileHeroUrl: heroUrl,
            profileAvatarUrl: avatarUrl,
          },
          catalog: { products: [], categories: [] },
        },
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );
    const res = await testRequest
      .post('/api/stores/publish')
      .set('Authorization', `Bearer ${token}`)
      .send({ storeId: 'temp', generationRunId: runId })
      .expect(200);
    expect(res.body.ok).toBe(true);
    const business = await prisma.business.findUnique({
      where: { id: res.body.publishedStoreId },
    });
    expect(business).toBeDefined();
    expect(business.heroImageUrl).toBe(heroUrl);
    expect(business.avatarImageUrl).toBe(avatarUrl);
    expect(business.publishedAt).toBeDefined();
  });

  it('publish preserves category mapping; preview returns categories and items with valid categoryId', async () => {
    const testUser = await prisma.user.create({
      data: {
        email: 'publish-categories@example.com',
        passwordHash: 'test-hash',
        displayName: 'Categories Test',
        roles: '["viewer"]',
      },
    });
    const runId = 'publish-test-run-categories';
    await prisma.draftStore.create({
      data: {
        mode: 'ai',
        status: 'ready',
        generationRunId: runId,
        input: { generationRunId: runId },
        preview: {
          storeName: 'Category Store',
          storeType: 'General',
          meta: { storeName: 'Category Store', storeType: 'General' },
          categories: [
            { id: 'mains', name: 'Mains' },
            { id: 'other', name: 'Other' },
          ],
          items: [
            { id: 'p1', name: 'Burger', description: 'Good', categoryId: 'mains', price: 10 },
            { id: 'p2', name: 'Fries', description: 'Side', categoryId: 'mains', price: 4 },
            { id: 'p3', name: 'Mystery Item', categoryId: 'other' },
          ],
        },
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'default-secret-change-this'
    );
    const res = await testRequest
      .post('/api/store/publish')
      .set('Authorization', `Bearer ${token}`)
      .send({ storeId: 'temp', generationRunId: runId })
      .expect(200);
    expect(res.body.ok).toBe(true);
    const storeId = res.body.publishedStoreId;
    expect(storeId).toBeDefined();

    const previewRes = await testRequest.get(`/api/store/${storeId}/preview`).expect(200);
    expect(previewRes.body.ok).toBe(true);
    const preview = previewRes.body.preview;
    expect(preview).toBeDefined();
    expect(Array.isArray(preview.categories)).toBe(true);
    expect(preview.categories.length).toBeGreaterThanOrEqual(1);
    const categoryIds = new Set(preview.categories.map((c) => c.id));
    expect(categoryIds.has('other')).toBe(true);

    expect(Array.isArray(preview.items)).toBe(true);
    expect(preview.items.length).toBe(3);
    for (const item of preview.items) {
      const itemCatId = item.categoryId != null ? item.categoryId : (item.category && String(item.category).toLowerCase().replace(/\s+/g, '-')) || 'other';
      expect(categoryIds.has(itemCatId) || itemCatId === 'other').toBe(true);
    }
    const mainsItems = preview.items.filter((i) => (i.categoryId || i.category || '').toString().toLowerCase().includes('main') || (i.categoryId || '') === 'mains');
    expect(mainsItems.length).toBeGreaterThanOrEqual(2);
  });
});
