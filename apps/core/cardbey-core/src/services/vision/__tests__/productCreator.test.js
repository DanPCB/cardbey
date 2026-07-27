import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockBusinessFindFirst = vi.fn();
const mockProductFindFirst = vi.fn();
const mockAddProduct = vi.fn();

vi.mock('../../../lib/prisma.js', () => ({
  getPrismaClient: () => ({
    business: { findFirst: mockBusinessFindFirst },
    product: { findFirst: mockProductFindFirst },
  }),
}));

vi.mock('../../../lib/catalog/productCatalogService.js', () => ({
  addProduct: (...args) => mockAddProduct(...args),
  normalizeProductName: (name) => String(name).trim().toLowerCase(),
}));

import { createFromScan } from '../productCreator.js';

describe('productCreator.createFromScan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires store id', async () => {
    const result = await createFromScan('', { name: 'X' }, 'u1');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('STORE_REQUIRED');
  });

  it('requires extracted name', async () => {
    mockBusinessFindFirst.mockResolvedValueOnce({ id: 's1', name: 'Store' });
    const result = await createFromScan('s1', {}, 'u1');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('NAME_NOT_FOUND');
  });

  it('creates product when store owned and name present', async () => {
    mockBusinessFindFirst.mockResolvedValueOnce({ id: 's1', name: 'Store' });
    mockProductFindFirst.mockResolvedValueOnce(null);
    mockAddProduct.mockResolvedValueOnce({ id: 'p1', name: 'Latte Card' });

    const result = await createFromScan(
      's1',
      { name: 'Latte Card', phone: '0400 000 000' },
      'u1',
    );

    expect(result.ok).toBe(true);
    expect(result.product?.id).toBe('p1');
    expect(mockAddProduct).toHaveBeenCalled();
  });
});
