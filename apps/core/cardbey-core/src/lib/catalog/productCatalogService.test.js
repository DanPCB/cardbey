// DANH: skill-round2-catalog
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addProduct,
  getCatalogSummary,
  listProducts,
  normalizeProductName,
  removeProduct,
  updatePricing,
  updateProduct,
} from './productCatalogService.js';

describe('productCatalogService', () => {
  /** @type {object} */
  let prisma;

  beforeEach(() => {
    prisma = {
      product: {
        count: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
  });

  it('normalizeProductName lowercases and trims', () => {
    expect(normalizeProductName('  Classic Manicure ')).toBe('classic manicure');
  });

  it('getCatalogSummary returns total and byCategory', async () => {
    prisma.product.count.mockResolvedValue(3);
    prisma.product.findMany.mockResolvedValue([
      { category: 'Nails' },
      { category: 'Nails' },
      { category: 'Spa' },
    ]);

    const summary = await getCatalogSummary(prisma, 'store-1');
    expect(summary.total).toBe(3);
    expect(summary.byCategory).toHaveLength(2);
  });

  it('listProducts filters by category', async () => {
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Manicure' }]);
    const rows = await listProducts(prisma, 'store-1', { category: 'Nails' });
    expect(rows).toHaveLength(1);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ businessId: 'store-1', category: 'Nails' }),
      }),
    );
  });

  it('addProduct creates product with normalizedName', async () => {
    prisma.product.create.mockResolvedValue({ id: 'p1', name: 'Classic Manicure' });
    const row = await addProduct(prisma, 'store-1', {
      name: 'Classic Manicure',
      price: 45,
      category: 'Nails',
    });
    expect(row.id).toBe('p1');
    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: 'store-1',
          normalizedName: 'classic manicure',
          price: 45,
        }),
      }),
    );
  });

  it('updateProduct modifies existing product', async () => {
    prisma.product.update.mockResolvedValue({ id: 'p1', name: 'Deluxe Manicure', price: 55 });
    const row = await updateProduct(prisma, 'p1', { name: 'Deluxe Manicure', price: 55 });
    expect(row.price).toBe(55);
  });

  it('removeProduct soft-deletes via deletedAt', async () => {
    prisma.product.update.mockResolvedValue({ id: 'p1', deletedAt: new Date() });
    await removeProduct(prisma, 'p1');
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPublished: false }),
      }),
    );
  });

  it('updatePricing updates multiple products', async () => {
    prisma.product.update
      .mockResolvedValueOnce({ id: 'p1', price: 40 })
      .mockResolvedValueOnce({ id: 'p2', price: 50 });
    const rows = await updatePricing(prisma, 'store-1', [
      { productId: 'p1', price: 40 },
      { productId: 'p2', price: 50 },
    ]);
    expect(rows).toHaveLength(2);
  });
});
