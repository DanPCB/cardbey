// DANH: skill-round2-menu
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMenuDiff, publishMenu, syncFromSource, validateMenu } from './menuSyncService.js';

describe('menuSyncService', () => {
  /** @type {object} */
  let prisma;

  beforeEach(() => {
    prisma = {
      product: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };
  });

  it('validateMenu returns no issues for valid catalog', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Latte', price: 5, category: 'Drinks' },
    ]);
    const result = await validateMenu(prisma, 'store-1');
    expect(result.issues).toHaveLength(0);
    expect(result.valid).toBe(1);
  });

  it('validateMenu flags missing name', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', name: '  ', price: 5, category: 'Drinks' },
    ]);
    const result = await validateMenu(prisma, 'store-1');
    expect(result.issues.some((i) => i.issue === 'missing_name')).toBe(true);
  });

  it('validateMenu flags invalid price', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Tea', price: -1, category: 'Drinks' },
    ]);
    const result = await validateMenu(prisma, 'store-1');
    expect(result.issues.some((i) => i.issue === 'invalid_price')).toBe(true);
  });

  it('validateMenu flags missing category', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Tea', price: 4, category: '' },
    ]);
    const result = await validateMenu(prisma, 'store-1');
    expect(result.issues.some((i) => i.issue === 'missing_category')).toBe(true);
  });

  it('syncFromSource creates new items', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    prisma.product.create.mockResolvedValue({ id: 'p-new', name: 'Mocha' });

    const result = await syncFromSource(prisma, 'store-1', {
      source: 'manual',
      items: [{ name: 'Mocha', price: 6, category: 'Drinks' }],
    });

    expect(result.ok).toBe(true);
    expect(result.synced).toBe(1);
    expect(prisma.product.create).toHaveBeenCalled();
  });

  it('syncFromSource updates existing items by name', async () => {
    prisma.product.findFirst.mockResolvedValue({
      id: 'p1',
      name: 'Mocha',
      price: 5,
      description: null,
      category: 'Drinks',
    });
    prisma.product.update.mockResolvedValue({ id: 'p1', name: 'Mocha', price: 6 });

    const result = await syncFromSource(prisma, 'store-1', {
      source: 'csv',
      items: [{ name: 'Mocha', price: 6, category: 'Drinks' }],
    });

    expect(result.synced).toBe(1);
    expect(prisma.product.update).toHaveBeenCalled();
  });

  it('getMenuDiff correctly identifies added items', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    const diff = await getMenuDiff(prisma, 'store-1', {
      incoming: [{ name: 'New Item', price: 10 }],
    });
    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(0);
  });

  it('getMenuDiff correctly identifies removed items', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Old Item', price: 8, category: 'Food' },
    ]);
    const diff = await getMenuDiff(prisma, 'store-1', { incoming: [] });
    expect(diff.removed).toHaveLength(1);
  });

  it('getMenuDiff correctly identifies price changes', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Burger', price: 12, category: 'Food' },
    ]);
    const diff = await getMenuDiff(prisma, 'store-1', {
      incoming: [{ name: 'Burger', price: 14 }],
    });
    expect(diff.changed).toHaveLength(1);
  });

  it('publishMenu updates all active items', async () => {
    prisma.product.updateMany.mockResolvedValue({ count: 4 });
    const result = await publishMenu(prisma, 'store-1');
    expect(result.published).toBe(4);
    expect(prisma.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPublished: true }),
      }),
    );
  });
});
