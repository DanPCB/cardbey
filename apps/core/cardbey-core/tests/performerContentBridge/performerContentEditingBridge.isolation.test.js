/**
 * Tenant isolation matrix — content editing bridge operations.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../../src/config/features.js', () => ({
  Features: { performerContentEditingBridge: { v1: true } },
}));

vi.mock('../../src/services/websiteEditing/resolveWebsiteEditingContext.js', () => ({
  resolveWebsiteEditingContext: vi.fn(async (_prisma, input = {}) => {
    const { storeId, draftId, userId, user, adminSupport } = input;
    if (!userId && !user) {
      const err = new Error('Unauthorized');
      err.statusCode = 401;
      err.code = 'unauthorized';
      throw err;
    }
    if (storeId === 'store_B' && userId === 'owner_A' && !adminSupport) {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      err.code = 'forbidden';
      throw err;
    }
    if (storeId === 'store_A' && draftId === 'draft_B') {
      const err = new Error('Draft does not belong to this store');
      err.statusCode = 403;
      err.code = 'cross_store_draft';
      throw err;
    }
    if (adminSupport && user?.role !== 'platform_admin') {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      err.code = 'forbidden';
      throw err;
    }
    return {
      ok: true,
      storeId: storeId || 'store_A',
      storeName: 'Florist A',
      draftId: draftId || 'draft_A',
      revisionId: draftId || 'draft_A',
      editingKind: 'published_with_revision',
      isPublishedStore: true,
      adminSupport: Boolean(adminSupport),
      liveUnchanged: true,
    };
  }),
}));

vi.mock('../../src/lib/feed/publicFeedRankBump.js', () => ({
  bumpPublicFeedRankForStore: vi.fn(async () => {}),
}));

vi.mock('../../src/lib/authorization.js', () => ({
  isPlatformAdmin: (user) => user?.role === 'platform_admin',
}));

import {
  resolveBridgeContext,
  proposeShowImprovement,
  acceptShowImprovement,
  discardShowImprovement,
  hideShowViaBridge,
  listBridgeShowWarnings,
  _clearProposalStoreForTests,
} from '../../src/services/performerContentBridge/performerContentEditingBridge.js';

function makePrisma(storeId = 'store_A') {
  const store = {
    id: storeId,
    userId: storeId === 'store_A' ? 'owner_A' : 'owner_B',
    name: 'Florist',
    type: 'florist',
    description: 'flowers',
    isActive: true,
    storefrontSettings: {
      featuredWorks: [
        {
          id: storeId === 'store_A' ? 'item_A' : 'item_B',
          title: 'Assessment',
          imageUrl: 'https://cdn.example/x.jpg',
          status: 'PUBLISHED',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    },
    stylePreferences: { miniWebsite: { sections: [] } },
  };
  return {
    business: {
      findUnique: vi.fn(async ({ where }) => (where.id === store.id ? store : null)),
      update: vi.fn(async ({ data }) => {
        Object.assign(store, data);
        return store;
      }),
    },
    auditEvent: { create: vi.fn(async () => ({})) },
  };
}

describe('content editing bridge isolation matrix', () => {
  let fileRoot;
  beforeEach(() => {
    fileRoot = path.join(os.tmpdir(), `ceb-iso-${Date.now()}`);
    fs.mkdirSync(fileRoot, { recursive: true });
    _clearProposalStoreForTests(fileRoot);
  });
  afterEach(() => {
    _clearProposalStoreForTests(fileRoot);
    try {
      fs.rmSync(fileRoot, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  it('Owner A / Store A / Draft A / Item A — allowed', async () => {
    const prisma = makePrisma('store_A');
    const ctx = await resolveBridgeContext(prisma, {
      storeId: 'store_A',
      draftId: 'draft_A',
      itemId: 'item_A',
      userId: 'owner_A',
      user: { id: 'owner_A' },
      fileRoot,
    });
    expect(ctx.ok).toBe(true);
    expect(ctx.item.id).toBe('item_A');
  });

  it('Owner A / Store B — rejected', async () => {
    const prisma = makePrisma('store_B');
    await expect(
      resolveBridgeContext(prisma, {
        storeId: 'store_B',
        draftId: 'draft_B',
        itemId: 'item_B',
        userId: 'owner_A',
        user: { id: 'owner_A' },
        fileRoot,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('Owner A / Store A / Draft B — rejected', async () => {
    const prisma = makePrisma('store_A');
    await expect(
      resolveBridgeContext(prisma, {
        storeId: 'store_A',
        draftId: 'draft_B',
        itemId: 'item_A',
        userId: 'owner_A',
        user: { id: 'owner_A' },
        fileRoot,
      }),
    ).rejects.toMatchObject({ code: 'cross_store_draft' });
  });

  it('Owner A / Store A / Item B — rejected without leaking title', async () => {
    const prisma = makePrisma('store_A');
    try {
      await resolveBridgeContext(prisma, {
        storeId: 'store_A',
        draftId: 'draft_A',
        itemId: 'item_B',
        userId: 'owner_A',
        user: { id: 'owner_A' },
        fileRoot,
      });
      expect.fail('should reject');
    } catch (err) {
      expect(err.code).toBe('item_not_found');
      expect(String(err.message)).not.toMatch(/Assessment|secret/i);
    }
  });

  it('Admin authorised — allowed with admin context', async () => {
    const prisma = makePrisma('store_A');
    const ctx = await resolveBridgeContext(prisma, {
      storeId: 'store_A',
      draftId: 'draft_A',
      itemId: 'item_A',
      userId: 'admin_1',
      user: { id: 'admin_1', role: 'platform_admin' },
      adminSupport: true,
      adminReason: 'support ticket',
      fileRoot,
    });
    expect(ctx.adminSupport).toBe(true);
  });

  it('Admin unauthorised — rejected', async () => {
    const prisma = makePrisma('store_A');
    await expect(
      resolveBridgeContext(prisma, {
        storeId: 'store_A',
        draftId: 'draft_A',
        itemId: 'item_A',
        userId: 'user_x',
        user: { id: 'user_x', role: 'user' },
        adminSupport: true,
        adminReason: 'nope',
        fileRoot,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('Anonymous — rejected', async () => {
    const prisma = makePrisma('store_A');
    await expect(
      resolveBridgeContext(prisma, {
        storeId: 'store_A',
        draftId: 'draft_A',
        itemId: 'item_A',
        userId: null,
        user: null,
        fileRoot,
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('propose/accept/discard/hide/warnings cover isolation bindings', async () => {
    const prisma = makePrisma('store_A');
    const warnings = await listBridgeShowWarnings(prisma, {
      storeId: 'store_A',
      draftId: 'draft_A',
      userId: 'owner_A',
      user: { id: 'owner_A' },
      fileRoot,
    });
    expect(warnings.storeId).toBe('store_A');

    const proposed = await proposeShowImprovement(prisma, {
      storeId: 'store_A',
      draftId: 'draft_A',
      itemId: 'item_A',
      scope: 'relevance_title',
      userId: 'owner_A',
      user: { id: 'owner_A' },
      fileRoot,
    });
    await expect(
      acceptShowImprovement(prisma, {
        storeId: 'store_B',
        proposalId: proposed.proposal.proposalId,
        userId: 'owner_A',
        user: { id: 'owner_A' },
        fileRoot,
      }),
    ).rejects.toMatchObject({ code: 'cross_store_proposal' });

    await discardShowImprovement(prisma, {
      storeId: 'store_A',
      proposalId: proposed.proposal.proposalId,
      userId: 'owner_A',
      user: { id: 'owner_A' },
      fileRoot,
    });

    const hidden = await hideShowViaBridge(prisma, {
      storeId: 'store_A',
      draftId: 'draft_A',
      itemId: 'item_A',
      confirmed: true,
      userId: 'owner_A',
      user: { id: 'owner_A' },
      fileRoot,
    });
    expect(hidden.status).toBe('hidden');
  });
});
