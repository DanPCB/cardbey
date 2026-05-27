import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  chunkArray,
  prepareCatalogProductRows,
  getCatalogBatchChunkSize,
} from './stagedCatalogPublish.js';

describe('stagedCatalogPublish', () => {
  it('chunkArray splits rows evenly', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('prepareCatalogProductRows assigns stable ids and skips invalid items', () => {
    const categoryMap = new Map([['drinks', 'Drinks'], ['other', 'Other']]);
    const items = [
      { id: 'a', name: ' Latte ', price: 5, categoryId: 'drinks' },
      { name: '' },
      null,
      { name: 'Tea', category: 'Hot' },
    ];
    const { rows, publishedIdsByDraftIndex, preparedCount, skippedCount } = prepareCatalogProductRows(items, {
      categoryMap,
      otherCategoryName: 'Other',
      defaultCurrency: 'AUD',
    });
    expect(preparedCount).toBe(2);
    expect(skippedCount).toBe(2);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Latte');
    expect(rows[0].currency).toBe('AUD');
    expect(typeof rows[0].id).toBe('string');
    expect(publishedIdsByDraftIndex[0]).toBe(rows[0].id);
    expect(publishedIdsByDraftIndex[3]).toBe(rows[1].id);
  });

  it('prepareCatalogProductRows skips duplicate names', () => {
    const categoryMap = new Map([['other', 'Other']]);
    const items = [
      { name: 'House Special' },
      { name: 'Latte' },
      { name: 'house special' },
    ];
    const { rows, preparedCount, dedupeRemoved } = prepareCatalogProductRows(items, {
      categoryMap,
      otherCategoryName: 'Other',
      defaultCurrency: 'AUD',
    });
    expect(preparedCount).toBe(2);
    expect(dedupeRemoved).toBe(1);
    expect(rows).toHaveLength(2);
  });

  it('getCatalogBatchChunkSize defaults to 50', () => {
    const prev = process.env.COMMIT_DRAFT_CATALOG_CHUNK_SIZE;
    delete process.env.COMMIT_DRAFT_CATALOG_CHUNK_SIZE;
    expect(getCatalogBatchChunkSize()).toBe(50);
    process.env.COMMIT_DRAFT_CATALOG_CHUNK_SIZE = '25';
    expect(getCatalogBatchChunkSize()).toBe(25);
    if (prev === undefined) delete process.env.COMMIT_DRAFT_CATALOG_CHUNK_SIZE;
    else process.env.COMMIT_DRAFT_CATALOG_CHUNK_SIZE = prev;
  });
});

describe('replaceStoreCatalogInBatches', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('DATABASE_PROVIDER', 'sqlite');
  });

  it('uses short transactions per chunk', async () => {
    const { resetDbCapabilitiesCache } = await import('../../lib/persistence/dbCapabilityRegistry.js');
    resetDbCapabilitiesCache();
    const { replaceStoreCatalogInBatches } = await import('./stagedCatalogPublish.js');
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const transaction = vi.fn(async (fn) => fn({ product: { createMany } }));
    const prisma = { $transaction: transaction };

    const rows = [
      { id: 'p1', name: 'A' },
      { id: 'p2', name: 'B' },
      { id: 'p3', name: 'C' },
    ];
    const result = await replaceStoreCatalogInBatches(prisma, {
      businessId: 'biz-1',
      rows,
      chunkSize: 2,
    });
    expect(result.written).toBe(3);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(createMany).toHaveBeenCalledTimes(2);
    expect(createMany.mock.calls[0][0]).not.toHaveProperty('skipDuplicates');
  });
});
