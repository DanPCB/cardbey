/**
 * Load-style integration: commitDraft with 500+ products must not use one 60s interactive tx.
 * Skipped when DATABASE_URL points at postgres in CI without local sqlite.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { commitDraft, createDraft } from './draftStoreService.js';

const isSqlite =
  !process.env.DATABASE_URL ||
  process.env.DATABASE_URL.startsWith('file:') ||
  process.env.DATABASE_URL.includes('sqlite');

describe.skipIf(!isSqlite)('commitDraft staged catalog load', () => {
  let userId;
  const draftIds = [];
  const businessIds = [];

  beforeAll(async () => {
    const email = `staged-load-${Date.now()}@test.local`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'test',
        displayName: 'Staged Load',
        roles: '["owner"]',
        role: 'owner',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    for (const bid of businessIds) {
      await prisma.product.deleteMany({ where: { businessId: bid } }).catch(() => {});
      await prisma.business.delete({ where: { id: bid } }).catch(() => {});
    }
    for (const draftId of draftIds) {
      await prisma.draftStore.delete({ where: { id: draftId } }).catch(() => {});
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
  });

  it(
    'commits 520 products without P2028',
    async () => {
      const items = Array.from({ length: 520 }, (_, i) => ({
        id: `item-${i}`,
        name: `Product ${i}`,
        price: 4.5 + (i % 10),
        categoryId: i % 2 === 0 ? 'food' : 'drinks',
      }));
      const draft = await createDraft({
        mode: 'template',
        input: { businessName: 'Load Test Cafe', storeType: 'cafe' },
        meta: { ownerUserId: userId },
      });
      draftIds.push(draft.id);
      await prisma.draftStore.update({
        where: { id: draft.id },
        data: {
          status: 'ready',
          preview: {
            storeName: 'Load Test Cafe',
            storeType: 'cafe',
            items,
            categories: [
              { id: 'food', name: 'Food' },
              { id: 'drinks', name: 'Drinks' },
            ],
          },
        },
      });

      const result = await commitDraft(draft.id, {
        userId,
        acceptTerms: true,
      });

      expect(result.ok).toBe(true);
      expect(result.itemsCreated).toBeGreaterThanOrEqual(500);
      businessIds.push(result.storeId);

      const count = await prisma.product.count({ where: { businessId: result.storeId } });
      expect(count).toBe(result.itemsCreated);
    },
    120_000,
  );
});
