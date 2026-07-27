/**
 * Multi-store: commitDraft must create a second Business, not update the first.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { commitDraft, createDraft, generateDraft } from './draftStoreService.js';

describe('commitDraft multi-store identity', () => {
  let userId;
  const businessIds = [];
  const draftIds = [];

  beforeAll(async () => {
    const email = `multi-store-${Date.now()}@test.local`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'test',
        displayName: 'Multi Store Tester',
        roles: '["owner"]',
        role: 'owner',
      },
    });
    userId = user.id;

    const first = await prisma.business.create({
      data: {
        userId,
        name: 'First Store Original',
        type: 'cafe',
        slug: `first-store-${Date.now()}`,
        isActive: true,
      },
    });
    businessIds.push(first.id);
  });

  afterAll(async () => {
    for (const draftId of draftIds) {
      await prisma.product.deleteMany({ where: { businessId: { in: businessIds } } }).catch(() => {});
      await prisma.draftStore.delete({ where: { id: draftId } }).catch(() => {});
    }
    for (const bid of businessIds.slice(1)) {
      await prisma.product.deleteMany({ where: { businessId: bid } }).catch(() => {});
      await prisma.business.delete({ where: { id: bid } }).catch(() => {});
    }
    if (userId) {
      await prisma.business.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
  });

  async function makeReadyDraft(storeName) {
    const draft = await createDraft({
      mode: 'template',
      input: { businessName: storeName, storeType: 'cafe' },
      meta: { ownerUserId: userId },
    });
    draftIds.push(draft.id);
    await prisma.draftStore.update({
      where: { id: draft.id },
      data: {
        status: 'ready',
        preview: {
          storeName,
          storeType: 'cafe',
          items: [{ id: 'i1', name: 'Coffee', price: 5, category: 'Drinks', categoryId: 'drinks' }],
          categories: [{ id: 'drinks', name: 'Drinks' }],
        },
      },
    });
    return draft.id;
  }

  it('second commit creates new business without mutating first store name', async () => {
    const firstBefore = await prisma.business.findUnique({
      where: { id: businessIds[0] },
      select: { name: true },
    });

    const draftId = await makeReadyDraft('Second Store Brand New');
    const result = await commitDraft(draftId, {
      userId,
      acceptTerms: true,
    });

    expect(result.storeId).toBeTruthy();
    expect(result.storeId).not.toBe(businessIds[0]);
    businessIds.push(result.storeId);

    const firstAfter = await prisma.business.findUnique({
      where: { id: businessIds[0] },
      select: { name: true },
    });
    expect(firstAfter?.name).toBe(firstBefore?.name);

    const count = await prisma.business.count({ where: { userId } });
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
