/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  user: { findUnique: vi.fn(), create: vi.fn() },
  business: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  product: { deleteMany: vi.fn(), create: vi.fn() },
  draftStore: { update: vi.fn() },
};

vi.mock('../../../lib/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../../../utils/slug.js', () => ({
  generateUniqueStoreSlug: vi.fn(async () => 'should-not-be-called'),
}));
vi.mock('../draftStoreService.js', () => ({
  getDraft: vi.fn(async () => ({
    id: 'draft-2',
    status: 'ready',
    committedStoreId: null,
    generationRunId: 'run-2',
    preview: JSON.stringify({
      storeName: 'Chicken Food',
      storeType: 'restaurant',
      items: [{ name: 'Nuggets', price: 10 }],
      categories: [],
      meta: {},
    }),
    input: JSON.stringify({ businessName: 'Chicken Food', location: 'Melbourne' }),
  })),
  buildCategoryIdToNameMap: () => new Map([['other', 'Other']]),
  normalizeDraftProductPrice: () => 10,
  patchDraftPreview: vi.fn(async () => {}),
  resolveDraftItemImageUrl: () => null,
  resolveDraftProductCategoryName: () => 'Other',
}));
vi.mock('../../../lib/storeTransactionMode.js', () => ({
  resolveTransactionCommerce: () => ({
    transactionMode: 'order',
    catalogLabel: 'Menu',
    ctaLabel: 'Order',
  }),
}));

describe('createGuestTempStoreFromDraft reuse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: 'guest_abc' });
    prismaMock.business.findMany.mockResolvedValue([
      {
        id: 'biz-canonical',
        slug: 'chicken-food',
        name: 'Chicken Food',
        createdAt: new Date('2026-01-01'),
      },
    ]);
    prismaMock.business.update.mockResolvedValue({});
    prismaMock.product.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.product.create.mockResolvedValue({});
    prismaMock.draftStore.update.mockResolvedValue({});
  });

  it('reuses existing guest draft Business instead of creating chicken-food-2', async () => {
    const { createGuestTempStoreFromDraft } = await import('../guestTempStore.js');
    const result = await createGuestTempStoreFromDraft('draft-2', {
      userId: 'guest_abc',
      generationRunId: 'run-2',
    });

    expect(result.storeId).toBe('biz-canonical');
    expect(result.storeSlug).toBe('chicken-food');
    expect(result.reusedExisting).toBe(true);
    expect(prismaMock.business.create).not.toHaveBeenCalled();
    expect(prismaMock.draftStore.update).toHaveBeenCalledWith({
      where: { id: 'draft-2' },
      data: { committedStoreId: 'biz-canonical' },
    });
  });
});
