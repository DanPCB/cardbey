/**
 * Integration tests: qaReport persisted after patchDraftPreview and returned in GET draft.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { patchDraftPreview, getDraft } from '../src/services/draftStore/draftStoreService.js';
import { getPrismaClient } from '../src/lib/prisma.js';

process.env.NODE_ENV = 'test';

describe('qaReport integration', () => {
  let draftId;
  const prisma = getPrismaClient();

  beforeEach(async () => {
    await prisma.draftStore.deleteMany({});
    const draft = await prisma.draftStore.create({
      data: {
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        mode: 'template',
        status: 'ready',
        input: { storeId: 'temp', generationRunId: 'test-qa-' + Date.now() },
        preview: {
          storeName: 'Test Store',
          storeType: 'cafe',
          items: [
            { id: 'p1', name: 'Latte', imageUrl: 'https://example.com/1.jpg' },
            { id: 'p2', name: 'Espresso', imageUrl: null },
          ],
          categories: [{ id: 'c1', name: 'Drinks' }],
        },
        committedStoreId: null,
      },
    });
    draftId = draft.id;
  });

  afterAll(async () => {
    await prisma.draftStore.deleteMany({});
  });

  it('patchDraftPreview persists qaReport in preview.meta', async () => {
    const updated = await patchDraftPreview(draftId, { items: [] });
    const preview = typeof updated.preview === 'object' ? updated.preview : JSON.parse(updated.preview || '{}');
    expect(preview.meta).toBeDefined();
    expect(preview.meta.qaReport).toBeDefined();
    expect(preview.meta.qaReport).toHaveProperty('totalItems');
    expect(preview.meta.qaReport).toHaveProperty('itemsWithImages');
    expect(preview.meta.qaReport).toHaveProperty('score');
    expect(preview.meta.qaReport).toHaveProperty('computedAt');
  });

  it('getDraft returns draft with qaReport after patch (repair-style)', async () => {
    await patchDraftPreview(draftId, { items: [{ id: 'p1', name: 'Latte', imageUrl: 'https://x.com/1.jpg' }] });
    const draft = await getDraft(draftId);
    const preview = typeof draft.preview === 'object' ? draft.preview : JSON.parse(draft.preview || '{}');
    expect(preview.meta?.qaReport).toBeDefined();
    expect(preview.meta.qaReport.totalItems).toBeGreaterThanOrEqual(1);
    expect(typeof preview.meta.qaReport.score).toBe('number');
  });
});
