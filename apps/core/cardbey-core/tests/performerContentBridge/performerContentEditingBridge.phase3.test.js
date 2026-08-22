/**
 * Phase 3 — durable proposals, expiry, concurrency, isolation, readiness.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../../src/config/features.js', () => ({
  Features: {
    performerContentEditingBridge: { v1: true },
  },
}));

vi.mock('../../src/services/websiteEditing/resolveWebsiteEditingContext.js', () => ({
  resolveWebsiteEditingContext: vi.fn(async ({ storeId, draftId }) => {
    if (storeId === 'store_B' && draftId === 'draft_A') {
      const err = new Error('Draft does not belong to this store');
      err.statusCode = 403;
      err.code = 'cross_store_draft';
      throw err;
    }
    return {
      ok: true,
      storeId: storeId || 'store_A',
      storeName: storeId === 'store_B' ? 'Other' : 'Florist A',
      draftId: draftId || 'draft_A',
      revisionId: draftId || 'draft_A',
      editingKind: 'published_with_revision',
      isPublishedStore: true,
      adminSupport: false,
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
  proposeShowImprovement,
  acceptShowImprovement,
  discardShowImprovement,
  hideShowViaBridge,
  resolveBridgeContext,
  getBridgeReadiness,
  _clearProposalStoreForTests,
  _resetBridgeTelemetryForTests,
  computeItemFingerprint,
} from '../../src/services/performerContentBridge/performerContentEditingBridge.js';
import {
  getContentEditProposal,
  DEFAULT_PROPOSAL_TTL_MS,
} from '../../src/services/contentEditProposals/contentEditProposalRepository.js';

function makeWorks(overrides = {}) {
  return [
    {
      id: 'show_A',
      title: 'Assessment',
      imageUrl: 'https://cdn.example/a.jpg',
      status: 'PUBLISHED',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    },
  ];
}

function makePrisma({ storeId = 'store_A', works, ownerId = 'owner_A' } = {}) {
  const store = {
    id: storeId,
    userId: ownerId,
    name: storeId === 'store_B' ? 'Other Store' : 'Florist A',
    type: 'florist',
    description: 'bouquets',
    isActive: true,
    storefrontSettings: { featuredWorks: works || makeWorks() },
    stylePreferences: { miniWebsite: { sections: [] } },
  };
  const auditEvents = [];
  return {
    _store: store,
    _auditEvents: auditEvents,
    business: {
      findUnique: vi.fn(async ({ where }) => {
        if (where.id === store.id) return store;
        return null;
      }),
      update: vi.fn(async ({ data }) => {
        Object.assign(store, data);
        return store;
      }),
    },
    auditEvent: {
      create: vi.fn(async ({ data }) => {
        auditEvents.push(data);
        return data;
      }),
    },
  };
}

describe('Phase 3 content editing bridge hardening', () => {
  let fileRoot;

  beforeEach(() => {
    fileRoot = path.join(os.tmpdir(), `ceb-p3-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(fileRoot, { recursive: true });
    _clearProposalStoreForTests(fileRoot);
    _resetBridgeTelemetryForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    _clearProposalStoreForTests(fileRoot);
    try {
      fs.rmSync(fileRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('persists proposals durably in file store (survives reload)', async () => {
    const prisma = makePrisma();
    const proposed = await proposeShowImprovement(prisma, {
      storeId: 'store_A',
      itemId: 'show_A',
      scope: 'relevance_title',
      userId: 'owner_A',
      user: { id: 'owner_A' },
      fileRoot,
    });
    expect(proposed.status).toBe('proposal_ready');
    expect(prisma.business.update).not.toHaveBeenCalled();

    const reloaded = await getContentEditProposal(prisma, proposed.proposal.proposalId, { fileRoot });
    expect(reloaded?.status).toBe('PENDING');
    expect(reloaded?.providerMethod).toBe('deterministic_relevance');
    expect(reloaded?.baseFingerprint).toBeTruthy();
  });

  it('expired proposals cannot be accepted', async () => {
    const prisma = makePrisma();
    const proposed = await proposeShowImprovement(prisma, {
      storeId: 'store_A',
      itemId: 'show_A',
      scope: 'relevance_title',
      userId: 'owner_A',
      user: { id: 'owner_A' },
      fileRoot,
    });
    // Force expiry on disk
    const fp = path.join(fileRoot, `${proposed.proposal.proposalId}.json`);
    const row = JSON.parse(fs.readFileSync(fp, 'utf8'));
    row.expiresAt = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(fp, JSON.stringify(row));

    await expect(
      acceptShowImprovement(prisma, {
        storeId: 'store_A',
        proposalId: proposed.proposal.proposalId,
        userId: 'owner_A',
        user: { id: 'owner_A' },
        fileRoot,
      }),
    ).rejects.toMatchObject({ code: 'proposal_expired' });
  });

  it('discard then accept fails; discard is non-mutating', async () => {
    const prisma = makePrisma();
    const proposed = await proposeShowImprovement(prisma, {
      storeId: 'store_A',
      itemId: 'show_A',
      scope: 'relevance_title',
      userId: 'owner_A',
      user: { id: 'owner_A' },
      fileRoot,
    });
    await discardShowImprovement(prisma, {
      storeId: 'store_A',
      proposalId: proposed.proposal.proposalId,
      userId: 'owner_A',
      user: { id: 'owner_A' },
      fileRoot,
    });
    expect(prisma.business.update).not.toHaveBeenCalled();
    await expect(
      acceptShowImprovement(prisma, {
        storeId: 'store_A',
        proposalId: proposed.proposal.proposalId,
        userId: 'owner_A',
        user: { id: 'owner_A' },
        fileRoot,
      }),
    ).rejects.toMatchObject({ code: 'proposal_discarded' });
  });

  it('accept is idempotent; second accept does not double-apply', async () => {
    const prisma = makePrisma();
    const proposed = await proposeShowImprovement(prisma, {
      storeId: 'store_A',
      itemId: 'show_A',
      scope: 'relevance_title',
      userId: 'owner_A',
      user: { id: 'owner_A' },
      fileRoot,
    });
    const first = await acceptShowImprovement(prisma, {
      storeId: 'store_A',
      proposalId: proposed.proposal.proposalId,
      expectedUpdatedAt: proposed.proposal.baseUpdatedAt,
      expectedFingerprint: proposed.proposal.baseFingerprint,
      userId: 'owner_A',
      user: { id: 'owner_A' },
      fileRoot,
    });
    expect(first.status).toBe('applied');
    const calls = prisma.business.update.mock.calls.length;
    const second = await acceptShowImprovement(prisma, {
      storeId: 'store_A',
      proposalId: proposed.proposal.proposalId,
      userId: 'owner_A',
      user: { id: 'owner_A' },
      fileRoot,
    });
    expect(second.idempotent).toBe(true);
    expect(prisma.business.update.mock.calls.length).toBe(calls);
  });

  it('manual fingerprint change makes proposal stale on accept', async () => {
    const prisma = makePrisma();
    const proposed = await proposeShowImprovement(prisma, {
      storeId: 'store_A',
      itemId: 'show_A',
      scope: 'relevance_title',
      userId: 'owner_A',
      user: { id: 'owner_A' },
      fileRoot,
    });
    prisma._store.storefrontSettings.featuredWorks[0].title = 'Manual edit';
    prisma._store.storefrontSettings.featuredWorks[0].updatedAt = '2026-02-01T00:00:00.000Z';

    await expect(
      acceptShowImprovement(prisma, {
        storeId: 'store_A',
        proposalId: proposed.proposal.proposalId,
        expectedUpdatedAt: proposed.proposal.baseUpdatedAt,
        expectedFingerprint: proposed.proposal.baseFingerprint,
        userId: 'owner_A',
        user: { id: 'owner_A' },
        fileRoot,
      }),
    ).rejects.toMatchObject({ code: 'concurrency_conflict', statusCode: 409 });
  });

  it('hide invalidates pending proposals and does not archive', async () => {
    const prisma = makePrisma();
    const proposed = await proposeShowImprovement(prisma, {
      storeId: 'store_A',
      itemId: 'show_A',
      scope: 'relevance_title',
      userId: 'owner_A',
      user: { id: 'owner_A' },
      fileRoot,
    });
    const hidden = await hideShowViaBridge(prisma, {
      storeId: 'store_A',
      itemId: 'show_A',
      confirmed: true,
      userId: 'owner_A',
      user: { id: 'owner_A' },
      fileRoot,
    });
    expect(hidden.status).toBe('hidden');
    expect(hidden.archived).toBe(false);
    const stale = await getContentEditProposal(prisma, proposed.proposal.proposalId, { fileRoot });
    expect(stale.status).toBe('STALE');
  });

  it('cross-store item is rejected without leaking titles', async () => {
    const prisma = makePrisma({ storeId: 'store_A' });
    await expect(
      resolveBridgeContext(prisma, {
        storeId: 'store_A',
        itemId: 'missing_other_store_item',
        userId: 'owner_A',
        user: { id: 'owner_A' },
        fileRoot,
      }),
    ).rejects.toMatchObject({ code: 'item_not_found' });
  });

  it('owner cannot accept another store proposal by swapping storeId', async () => {
    const prisma = makePrisma({ storeId: 'store_A' });
    const proposed = await proposeShowImprovement(prisma, {
      storeId: 'store_A',
      itemId: 'show_A',
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
  });

  it('admin accept requires reason; owner path does not', async () => {
    const prisma = makePrisma();
    const proposed = await proposeShowImprovement(prisma, {
      storeId: 'store_A',
      itemId: 'show_A',
      scope: 'relevance_title',
      userId: 'admin_1',
      user: { id: 'admin_1', role: 'platform_admin' },
      adminSupport: true,
      adminReason: 'assisted cleanup of mismatched show',
      fileRoot,
    });
    expect(proposed.status).toBe('proposal_ready');

    await expect(
      acceptShowImprovement(prisma, {
        storeId: 'store_A',
        proposalId: proposed.proposal.proposalId,
        expectedUpdatedAt: proposed.proposal.baseUpdatedAt,
        expectedFingerprint: proposed.proposal.baseFingerprint,
        userId: 'admin_1',
        user: { id: 'admin_1', role: 'platform_admin' },
        adminSupport: true,
        fileRoot,
      }),
    ).rejects.toMatchObject({ code: 'admin_reason_required' });
  });

  it('audit events exclude full media query tokens and include actor/store', async () => {
    const prisma = makePrisma({
      works: [
        {
          id: 'show_A',
          title: 'Assessment',
          imageUrl: 'https://cdn.example/a.jpg?token=secret',
          status: 'PUBLISHED',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    await proposeShowImprovement(prisma, {
      storeId: 'store_A',
      itemId: 'show_A',
      scope: 'relevance_title',
      userId: 'owner_A',
      user: { id: 'owner_A' },
      fileRoot,
    });
    expect(prisma.auditEvent.create).toHaveBeenCalled();
    const payload = JSON.stringify(prisma._auditEvents);
    expect(payload).not.toMatch(/token=secret/);
    expect(prisma._auditEvents.some((e) => e.action === 'content_bridge_propose')).toBe(true);
  });

  it('readiness reports durable file mode and does not enable flags', async () => {
    const prisma = makePrisma();
    const readiness = await getBridgeReadiness(prisma);
    expect(readiness.coreFlagEnabled).toBe(true); // mocked Features v1 true in this suite
    expect(readiness.durableProposals).toBe(true);
    expect(readiness.auditAvailable).toBe(true);
    expect(['READY_FOR_LOCAL', 'READY_FOR_STAGING_PILOT', 'NOT_CONFIGURED', 'BLOCKED']).toContain(
      readiness.overall,
    );
    expect(readiness.overall).not.toBe('READY_FOR_STAGING_PILOT'); // local file must not claim staging
    expect(readiness.proposalStorageMode).toMatch(/file_content_edit_proposal/);
    expect(DEFAULT_PROPOSAL_TTL_MS).toBeGreaterThan(0);
    expect(computeItemFingerprint({ id: 'x', title: 'a' })).toHaveLength(64);
  });

  it('production without Prisma fails closed (no silent file fallback)', async () => {
    const prev = process.env.NODE_ENV;
    const prevFb = process.env.CONTENT_EDIT_PROPOSAL_FILE_FALLBACK;
    process.env.NODE_ENV = 'production';
    delete process.env.CONTENT_EDIT_PROPOSAL_FILE_FALLBACK;
    try {
      const { createContentEditProposal } = await import(
        '../../src/services/contentEditProposals/contentEditProposalRepository.js'
      );
      await expect(
        createContentEditProposal(
          { auditEvent: { create: async () => ({}) } },
          {
            actorId: 'a',
            storeId: 's',
            contentType: 'shows',
            contentItemId: 'i',
            scopedFields: ['title'],
            baseFingerprint: 'fp',
            proposedPatch: { title: 'x' },
            before: {},
            after: {},
            providerMethod: 'deterministic_relevance',
          },
        ),
      ).rejects.toMatchObject({ code: 'proposal_storage_unavailable', statusCode: 503 });
    } finally {
      process.env.NODE_ENV = prev;
      if (prevFb != null) process.env.CONTENT_EDIT_PROPOSAL_FILE_FALLBACK = prevFb;
    }
  });

  it('providerMethod stays deterministic — never labelled as AI', async () => {
    const prisma = makePrisma();
    const proposed = await proposeShowImprovement(prisma, {
      storeId: 'store_A',
      itemId: 'show_A',
      scope: 'relevance_title',
      userId: 'owner_A',
      user: { id: 'owner_A' },
      fileRoot,
    });
    expect(proposed.proposal.providerMethod).toBe('deterministic_relevance');
    expect(proposed.proposal.providerMethod).not.toMatch(/ai|llm/i);
  });
});
