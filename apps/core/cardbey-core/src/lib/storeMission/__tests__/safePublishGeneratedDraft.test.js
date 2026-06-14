import { describe, it, expect, vi, beforeEach } from 'vitest';

const { commitDraftMock, canAccessDraftStoreMock } = vi.hoisted(() => ({
  commitDraftMock: vi.fn(),
  canAccessDraftStoreMock: vi.fn(),
}));

vi.mock('../../../services/draftStore/draftStoreService.js', () => ({
  commitDraft: commitDraftMock,
}));

vi.mock('../../draftOwnership.js', () => ({
  canAccessDraftStore: canAccessDraftStoreMock,
}));

import { safePublishGeneratedDraft } from '../safePublishGeneratedDraft.js';

describe('safePublishGeneratedDraft', () => {
  const prisma = {
    draftStore: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    canAccessDraftStoreMock.mockResolvedValue(true);
    prisma.draftStore.update.mockResolvedValue({});
  });

  it('returns ok:true with storeId when commitDraft succeeds', async () => {
    prisma.draftStore.findUnique.mockResolvedValue({
      id: 'draft-1',
      status: 'ready',
      preview: { storeName: 'Cafe' },
      ownerUserId: 'user-1',
    });
    commitDraftMock.mockResolvedValue({
      storeId: 'store-1',
      storeSlug: 'cafe-melbourne',
    });

    const result = await safePublishGeneratedDraft({
      prisma,
      draftId: 'draft-1',
      userId: 'user-1',
      missionId: 'mission-1',
      correlationId: 'run-1',
      taskId: 'task-1',
    });

    expect(result.ok).toBe(true);
    expect(result.storeId).toBe('store-1');
    expect(result.storeSlug).toBe('cafe-melbourne');
    expect(commitDraftMock).toHaveBeenCalledWith('draft-1', {
      userId: 'user-1',
      acceptTerms: true,
      businessFields: { missionId: 'mission-1' },
    });
  });

  it('rejects publish when categories contain placeholder cat_N labels', async () => {
    prisma.draftStore.findUnique.mockResolvedValue({
      id: 'draft-cat',
      status: 'ready',
      preview: {
        storeName: 'Nails',
        categories: [{ id: 'cat_0', name: 'cat_0' }],
        items: [{ id: '1', name: 'Mani' }],
      },
      ownerUserId: 'user-1',
    });

    const result = await safePublishGeneratedDraft({
      prisma,
      draftId: 'draft-cat',
      userId: 'user-1',
    });

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toMatch(/invalid category labels/i);
    expect(commitDraftMock).not.toHaveBeenCalled();
  });

  it('returns ok:false retryable:true when commitDraft throws and keeps draftId', async () => {
    prisma.draftStore.findUnique.mockResolvedValue({
      id: 'draft-2',
      status: 'ready',
      preview: { storeName: 'Bakery' },
      ownerUserId: 'user-1',
    });
    commitDraftMock.mockRejectedValue(new Error('not ready to commit (status: generating)'));

    const result = await safePublishGeneratedDraft({
      prisma,
      draftId: 'draft-2',
      userId: 'user-1',
      correlationId: 'run-2',
    });

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.draftId).toBe('draft-2');
    expect(result.error).toContain('not ready to commit');
    expect(prisma.draftStore.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'draft-2' },
        data: expect.objectContaining({
          errorCode: 'PUBLISH_FAILED',
          recommendedAction: 'retry',
        }),
      }),
    );
  });

  it('returns ok:true idempotently when draft is already committed', async () => {
    prisma.draftStore.findUnique.mockResolvedValue({
      id: 'draft-3',
      status: 'committed',
      committedStoreId: 'store-3',
      preview: {},
      ownerUserId: 'user-1',
    });
    prisma.business.findUnique.mockResolvedValue({ id: 'store-3', slug: 'committed-cafe' });

    const result = await safePublishGeneratedDraft({
      prisma,
      draftId: 'draft-3',
      userId: 'user-1',
    });

    expect(result.ok).toBe(true);
    expect(result.alreadyCommitted).toBe(true);
    expect(result.storeId).toBe('store-3');
    expect(result.storeSlug).toBe('committed-cafe');
    expect(commitDraftMock).not.toHaveBeenCalled();
  });
});
