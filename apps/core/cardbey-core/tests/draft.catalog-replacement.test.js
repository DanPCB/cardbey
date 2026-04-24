import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';
import prisma from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

const testRequest = request(app);

process.env.NODE_ENV = 'test';

describe('PATCH /api/stores/temp/draft/catalog', () => {
  let user;
  let authToken;

  beforeEach(async () => {
    await resetDb(prisma);
    user = await prisma.user.create({
      data: {
        email: 'catalog-replace@example.com',
        passwordHash: 'test-hash',
        displayName: 'Catalog Replace User',
        roles: '["owner"]',
        role: 'owner',
      },
    });
    authToken = generateToken(user.id);
  });

  afterAll(async () => {
    await resetDb(prisma);
  });

  async function seedDraft(runId, previewItems, status = 'ready') {
    return prisma.draftStore.create({
      data: {
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        mode: 'ai',
        status,
        generationRunId: runId,
        input: { storeId: 'temp', generationRunId: runId },
        preview: {
          storeName: 'Test Store',
          storeType: 'Cafe',
          items: previewItems,
          categories: [{ id: 'c_old', name: 'Old' }],
          meta: { catalogSource: 'ai' },
        },
      },
    });
  }

  it('replaces draft.preview.items entirely and sets catalogSource=user_upload', async () => {
    const runId = `gen-${Date.now()}`;
    const draft = await seedDraft(runId, [
      { id: 'old1', name: 'Mock Item 1', price: 1, category: 'Old', imageUrl: null },
      { id: 'old2', name: 'Mock Item 2', price: 2, category: 'Old', imageUrl: null },
    ]);

    const res = await testRequest
      .patch('/api/stores/temp/draft/catalog')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        generationRunId: runId,
        items: [
          { name: 'Latte', price: 5.5, currency: 'AUD', description: '', category: 'Coffee', imageUrl: null, confidence: 0.9 },
          { name: 'Long Black', price: 4.5, currency: 'AUD', description: '', category: 'Coffee', imageUrl: null, confidence: 0.9 },
        ],
        fetchImages: false,
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.itemCount).toBe(2);
    expect(res.body.draftId).toBe(String(draft.id));
    expect(res.body.catalogSource).toBe('user_upload');

    const updated = await prisma.draftStore.findUnique({ where: { id: draft.id } });
    const preview = updated.preview && typeof updated.preview === 'object' ? updated.preview : JSON.parse(updated.preview || '{}');
    const names = (preview.items || []).map((i) => i.name);
    expect(names).toEqual(['Latte', 'Long Black']);
    expect(preview.meta.catalogSource).toBe('user_upload');
    expect(typeof preview.meta.catalogUploadedAt).toBe('string');
    // Ensure mock items are gone (not merged)
    expect(names.includes('Mock Item 1')).toBe(false);
  });

  it('allows replacement when draft status is committed (post-generation edit)', async () => {
    const runId = `gen-${Date.now()}`;
    const draft = await seedDraft(runId, [
      { id: 'old1', name: 'Mock Item 1', price: 1, category: 'Old', imageUrl: null },
    ], 'committed');

    const res = await testRequest
      .patch('/api/stores/temp/draft/catalog')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        generationRunId: runId,
        items: [
          { name: 'Latte', price: 5.5, currency: 'AUD', description: '', category: 'Coffee', imageUrl: null, confidence: 0.9 },
        ],
        fetchImages: false,
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.draftId).toBe(String(draft.id));

    const updated = await prisma.draftStore.findUnique({ where: { id: draft.id } });
    const preview = updated.preview && typeof updated.preview === 'object' ? updated.preview : JSON.parse(updated.preview || '{}');
    expect((preview.items || []).map((i) => i.name)).toEqual(['Latte']);
    expect(preview.meta.catalogSource).toBe('user_upload');
  });

  it('returns 400 when items is empty', async () => {
    const runId = `gen-${Date.now()}`;
    await seedDraft(runId, [{ id: 'old1', name: 'Mock Item 1', price: 1, category: 'Old' }]);

    await testRequest
      .patch('/api/stores/temp/draft/catalog')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ generationRunId: runId, items: [], fetchImages: false })
      .expect(400);
  });

  it('returns 404 for unknown generationRunId', async () => {
    await testRequest
      .patch('/api/stores/temp/draft/catalog')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        generationRunId: 'does-not-exist',
        items: [{ name: 'Latte', price: 5.5, currency: 'AUD', description: '', category: 'Coffee', imageUrl: null, confidence: 1 }],
        fetchImages: false,
      })
      .expect(404);
  });

  it('returns 400 when items length > 200', async () => {
    const runId = `gen-${Date.now()}`;
    await seedDraft(runId, [{ id: 'old1', name: 'Mock Item 1', price: 1, category: 'Old' }]);

    const tooMany = Array.from({ length: 201 }, (_, i) => ({
      name: `Item ${i}`,
      price: null,
      currency: 'AUD',
      description: '',
      category: 'General',
      imageUrl: null,
      confidence: 1,
    }));

    await testRequest
      .patch('/api/stores/temp/draft/catalog')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ generationRunId: runId, items: tooMany, fetchImages: false })
      .expect(400);
  });

  it('returns 403 when generationRunId is owned by another user task', async () => {
    const runId = `gen-${Date.now()}`;
    const other = await prisma.user.create({
      data: {
        email: 'other@example.com',
        passwordHash: 'test-hash',
        displayName: 'Other User',
        roles: '["owner"]',
        role: 'owner',
      },
    });
    await prisma.orchestratorTask.create({
      data: {
        entryPoint: 'test',
        tenantId: other.id,
        userId: other.id,
        status: 'completed',
        request: { generationRunId: runId },
        result: {},
      },
    });
    await seedDraft(runId, [{ id: 'old1', name: 'Mock Item 1', price: 1, category: 'Old' }]);

    await testRequest
      .patch('/api/stores/temp/draft/catalog')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        generationRunId: runId,
        items: [{ name: 'Latte', price: 5.5, currency: 'AUD', description: '', category: 'Coffee', imageUrl: null, confidence: 1 }],
        fetchImages: false,
      })
      .expect(403);
  });
});

