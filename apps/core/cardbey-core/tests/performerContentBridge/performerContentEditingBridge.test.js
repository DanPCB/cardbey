/**
 * Phase 2 — Performer content editing bridge service tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/config/features.js', () => ({
  Features: {
    performerContentEditingBridge: { v1: true },
  },
}));

vi.mock('../../src/services/websiteEditing/resolveWebsiteEditingContext.js', () => ({
  resolveWebsiteEditingContext: vi.fn(async () => ({
    ok: true,
    storeId: 'store_1',
    storeName: 'BB Flowers',
    draftId: 'draft_1',
    revisionId: 'draft_1',
    editingKind: 'published_with_revision',
    isPublishedStore: true,
    adminSupport: false,
    liveUnchanged: true,
  })),
}));

vi.mock('../../src/lib/feed/publicFeedRankBump.js', () => ({
  bumpPublicFeedRankForStore: vi.fn(async () => {}),
}));

vi.mock('../../src/lib/authorization.js', () => ({
  isPlatformAdmin: () => false,
}));

import {
  proposeShowImprovement,
  acceptShowImprovement,
  discardShowImprovement,
  hideShowViaBridge,
  resolveBridgeContext,
  _clearProposalStoreForTests,
} from '../../src/services/performerContentBridge/performerContentEditingBridge.js';

function makePrisma(works) {
  const store = {
    id: 'store_1',
    name: 'BB Flowers',
    type: 'florist',
    description: 'bouquets',
    isActive: true,
    storefrontSettings: { featuredWorks: works },
    stylePreferences: { miniWebsite: { sections: [] } },
  };
  return {
    business: {
      findUnique: vi.fn(async () => store),
      update: vi.fn(async ({ data }) => {
        Object.assign(store, data);
        return store;
      }),
    },
    auditEvent: { create: vi.fn(async () => ({})) },
  };
}

describe('performerContentEditingBridge', () => {
  beforeEach(() => {
    _clearProposalStoreForTests();
    vi.clearAllMocks();
  });

  it('resolves canonical context for a Show', async () => {
    const works = [
      {
        id: 'show_1',
        title: 'Assessment',
        imageUrl: 'https://cdn.example/a.jpg',
        status: 'PUBLISHED',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const prisma = makePrisma(works);
    const ctx = await resolveBridgeContext(prisma, {
      storeId: 'store_1',
      itemId: 'show_1',
      userId: 'owner_1',
      user: { id: 'owner_1' },
      returnTo: '/app',
    });
    expect(ctx.draftId).toBe('draft_1');
    expect(ctx.item.id).toBe('show_1');
    expect(ctx.editManuallyUrl).toContain('section=shows');
    expect(ctx.editManuallyUrl).toContain('itemId=show_1');
    expect(ctx.liveUnchanged).toBe(true);
    expect(ctx.relevanceWarning).toMatch(/may not match/i);
  });

  it('rejects unsafe returnTo', async () => {
    const prisma = makePrisma([]);
    const ctx = await resolveBridgeContext(prisma, {
      storeId: 'store_1',
      userId: 'owner_1',
      user: { id: 'owner_1' },
      returnTo: 'https://evil.example/',
    });
    expect(ctx.returnTo).toBe('/app');
  });

  it('proposal does not mutate before accept; accept applies without publishing', async () => {
    const works = [
      {
        id: 'show_1',
        title: 'Assessment',
        imageUrl: 'https://cdn.example/a.jpg',
        status: 'PUBLISHED',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const prisma = makePrisma(works);
    const proposed = await proposeShowImprovement(prisma, {
      storeId: 'store_1',
      itemId: 'show_1',
      scope: 'relevance_title',
      userId: 'owner_1',
      user: { id: 'owner_1' },
    });
    expect(proposed.status).toBe('proposal_ready');
    expect(proposed.published).toBe(false);
    expect(prisma.business.update).not.toHaveBeenCalled();

    const accepted = await acceptShowImprovement(prisma, {
      storeId: 'store_1',
      proposalId: proposed.proposal.proposalId,
      expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      userId: 'owner_1',
      user: { id: 'owner_1' },
    });
    expect(accepted.status).toBe('applied');
    expect(accepted.published).toBe(false);
    expect(prisma.business.update).toHaveBeenCalled();
    const saved = works; // mutated via Object.assign on storefrontSettings
    expect(accepted.item.title).not.toBe('Assessment');
  });

  it('discard leaves content unchanged', async () => {
    const works = [
      {
        id: 'show_1',
        title: 'Assessment',
        imageUrl: 'https://cdn.example/a.jpg',
        status: 'PUBLISHED',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const prisma = makePrisma(works);
    const proposed = await proposeShowImprovement(prisma, {
      storeId: 'store_1',
      itemId: 'show_1',
      scope: 'relevance_title',
      userId: 'owner_1',
      user: { id: 'owner_1' },
    });
    await discardShowImprovement(prisma, {
      storeId: 'store_1',
      proposalId: proposed.proposal.proposalId,
      userId: 'owner_1',
      user: { id: 'owner_1' },
    });
    expect(prisma.business.update).not.toHaveBeenCalled();
  });

  it('stale proposal fails optimistic concurrency', async () => {
    const works = [
      {
        id: 'show_1',
        title: 'Assessment',
        imageUrl: 'https://cdn.example/a.jpg',
        status: 'PUBLISHED',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const prisma = makePrisma(works);
    const proposed = await proposeShowImprovement(prisma, {
      storeId: 'store_1',
      itemId: 'show_1',
      scope: 'relevance_title',
      userId: 'owner_1',
      user: { id: 'owner_1' },
    });
    // Simulate manual edit
    works[0].updatedAt = '2026-02-01T00:00:00.000Z';
    works[0].title = 'Manual title';
    await expect(
      acceptShowImprovement(prisma, {
        storeId: 'store_1',
        proposalId: proposed.proposal.proposalId,
        expectedUpdatedAt: proposed.proposal.baseUpdatedAt,
        userId: 'owner_1',
        user: { id: 'owner_1' },
      }),
    ).rejects.toMatchObject({ code: 'concurrency_conflict', statusCode: 409 });
  });

  it('hide requires confirmation and does not archive', async () => {
    const works = [
      {
        id: 'show_1',
        title: 'Assessment',
        imageUrl: 'https://cdn.example/a.jpg',
        status: 'PUBLISHED',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const prisma = makePrisma(works);
    await expect(
      hideShowViaBridge(prisma, {
        storeId: 'store_1',
        itemId: 'show_1',
        confirmed: false,
        userId: 'owner_1',
        user: { id: 'owner_1' },
      }),
    ).rejects.toMatchObject({ code: 'confirmation_required' });

    const hidden = await hideShowViaBridge(prisma, {
      storeId: 'store_1',
      itemId: 'show_1',
      confirmed: true,
      userId: 'owner_1',
      user: { id: 'owner_1' },
    });
    expect(hidden.status).toBe('hidden');
    expect(hidden.archived).toBe(false);
    expect(hidden.item.status).toBe('HIDDEN');
  });
});
