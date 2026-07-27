import { describe, it, expect, vi, afterEach } from 'vitest';
import { resetDbCapabilitiesCache } from './dbCapabilityRegistry.js';
import { buildProductCreateManyArgs, batchInsertProducts } from './catalogPersistence.js';

describe('catalogPersistence', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetDbCapabilitiesCache();
  });

  it('omits skipDuplicates on sqlite', () => {
    vi.stubEnv('DATABASE_PROVIDER', 'sqlite');
    resetDbCapabilitiesCache();
    const args = buildProductCreateManyArgs([{ id: '1', name: 'A' }]);
    expect(args.data).toHaveLength(1);
    expect(args).not.toHaveProperty('skipDuplicates');
  });

  it('includes skipDuplicates on postgres', () => {
    vi.stubEnv('DATABASE_PROVIDER', 'postgres');
    resetDbCapabilitiesCache();
    const args = buildProductCreateManyArgs([{ id: '1', name: 'A' }]);
    expect(args.skipDuplicates).toBe(true);
  });

  it('batchInsertProducts dedupes duplicate names before createMany', async () => {
    vi.stubEnv('DATABASE_PROVIDER', 'sqlite');
    resetDbCapabilitiesCache();
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = vi.fn(async (fn) => fn({ product: { createMany } }));
    const prisma = { $transaction: transaction };

    const result = await batchInsertProducts(prisma, {
      businessId: 'biz-1',
      rows: [
        { id: 'a', name: 'Latte' },
        { id: 'b', name: 'latte' },
      ],
      chunkSize: 50,
    });

    expect(result.written).toBe(1);
    expect(result.dedupeRemoved).toBe(1);
    expect(result.mode).toBe('create_many_client_dedupe');
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0]).not.toHaveProperty('skipDuplicates');
  });
});
