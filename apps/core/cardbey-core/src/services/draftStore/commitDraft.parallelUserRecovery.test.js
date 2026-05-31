/**
 * Same-account parallel commitDraft must not fail with Business.userId P2002.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { commitDraft, createDraft } from './draftStoreService.js';

describe('commitDraft parallel same-user recovery', () => {
  let userId;
  const draftIds = [];
  const storeIds = [];

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `parallel-commit-${Date.now()}@test.local`,
        passwordHash: 'test',
        displayName: 'Parallel Commit Tester',
        roles: '["owner"]',
        role: 'owner',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    for (const sid of storeIds) {
      await prisma.product.deleteMany({ where: { businessId: sid } }).catch(() => {});
      await prisma.business.delete({ where: { id: sid } }).catch(() => {});
    }
    for (const draftId of draftIds) {
      await prisma.draftStore.delete({ where: { id: draftId } }).catch(() => {});
    }
    if (userId) {
      await prisma.business.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
  });

  async function makeReadyDraft(name, missionId) {
    const draft = await createDraft({
      mode: 'template',
      input: { businessName: name, storeType: 'cafe', missionId },
      meta: { ownerUserId: userId },
    });
    draftIds.push(draft.id);
    await prisma.draftStore.update({
      where: { id: draft.id },
      data: {
        status: 'ready',
        preview: {
          storeName: name,
          storeType: 'cafe',
          items: [{ id: 'i1', name: 'Latte', price: 5, category: 'Drinks', categoryId: 'drinks' }],
          categories: [{ id: 'drinks', name: 'Drinks' }],
        },
      },
    });
    return draft.id;
  }

  it('two commits for the same user complete without COMMIT_DRAFT_FAILED', async () => {
    const missionA = `mission-a-${Date.now()}`;
    const missionB = `mission-b-${Date.now()}`;
    const draftA = await makeReadyDraft('Parallel Store A', missionA);
    const draftB = await makeReadyDraft('Parallel Store B', missionB);

    const r1 = await commitDraft(draftA, {
      userId,
      acceptTerms: true,
      businessFields: { missionId: missionA },
    });
    const r2 = await commitDraft(draftB, {
      userId,
      acceptTerms: true,
      businessFields: { missionId: missionB },
    });

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r1.storeId).toBeTruthy();
    expect(r2.storeId).toBeTruthy();
    storeIds.push(r1.storeId, r2.storeId);
  });
});
