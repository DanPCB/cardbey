/**
 * Characterisation tests — Website Editing Phase 0 context resolver.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveWebsiteEditingContext,
  WEBSITE_EDITING_KINDS,
} from '../../src/services/websiteEditing/resolveWebsiteEditingContext.js';

function makeDraft(overrides = {}) {
  return {
    id: 'draft_1',
    status: 'ready',
    committedStoreId: null,
    generationRunId: null,
    input: { storeId: 'store_1', source: 'create-from-store' },
    preview: { storeName: 'Flower Shop', meta: { storeId: 'store_1' } },
    ...overrides,
  };
}

function makeBusiness(overrides = {}) {
  return {
    id: 'store_1',
    userId: 'owner_1',
    name: 'Flower Shop',
    type: 'Florist',
    description: null,
    logo: null,
    primaryColor: null,
    secondaryColor: null,
    tagline: null,
    heroText: null,
    stylePreferences: null,
    isActive: true,
    publishedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makePrisma({ business, draft, drafts = [] }) {
  const draftList = draft ? [draft, ...drafts] : drafts;
  return {
    business: {
      findUnique: vi.fn(async ({ where }) => {
        if (business && where.id === business.id) return business;
        return null;
      }),
    },
    draftStore: {
      findUnique: vi.fn(async ({ where }) => draftList.find((d) => d.id === where.id) || null),
      findFirst: vi.fn(async ({ where }) => {
        if (where?.committedStoreId) {
          return draftList.find((d) => d.committedStoreId === where.committedStoreId) || null;
        }
        return draftList[0] || null;
      }),
      findMany: vi.fn(async () => draftList),
    },
    product: {
      findMany: vi.fn(async () => []),
    },
  };
}

describe('resolveWebsiteEditingContext (Phase 0)', () => {
  const owner = { id: 'owner_1', role: 'owner' };
  const admin = { id: 'admin_1', role: 'platform_admin' };
  const other = { id: 'owner_2', role: 'owner' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves owner Website Editing without generationRunId', async () => {
    const business = makeBusiness();
    const draft = makeDraft({ committedStoreId: 'store_1' });
    const prisma = makePrisma({ business, draft });
    const ctx = await resolveWebsiteEditingContext(prisma, {
      storeId: 'store_1',
      userId: 'owner_1',
      user: owner,
      adminSupport: false,
    });
    expect(ctx.ok).toBe(true);
    expect(ctx.draftId).toBe('draft_1');
    expect(ctx.generationRunId).toBeNull();
    expect(ctx.liveUnchanged).toBe(true);
    expect(ctx.editingKind).toBe(WEBSITE_EDITING_KINDS.PUBLISHED_WITH_REVISION);
    expect(ctx.initializedRevision).toBe(false);
  });

  it('rejects unauthorised owner for another store', async () => {
    const business = makeBusiness();
    const prisma = makePrisma({ business, draft: makeDraft() });
    await expect(
      resolveWebsiteEditingContext(prisma, {
        storeId: 'store_1',
        userId: 'owner_2',
        user: other,
        adminSupport: false,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'forbidden' });
  });

  it('rejects draft belonging to another store', async () => {
    const business = makeBusiness();
    const draft = makeDraft({
      id: 'draft_other',
      input: { storeId: 'store_OTHER' },
      preview: { meta: { storeId: 'store_OTHER' } },
      committedStoreId: 'store_OTHER',
    });
    const prisma = makePrisma({ business, draft });
    await expect(
      resolveWebsiteEditingContext(prisma, {
        storeId: 'store_1',
        draftId: 'draft_other',
        userId: 'owner_1',
        user: owner,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'cross_store_draft' });
  });

  it('rejects non-admin for adminSupport', async () => {
    const business = makeBusiness();
    const prisma = makePrisma({ business, draft: makeDraft({ committedStoreId: 'store_1' }) });
    await expect(
      resolveWebsiteEditingContext(prisma, {
        storeId: 'store_1',
        userId: 'owner_1',
        user: owner,
        adminSupport: true,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'forbidden' });
  });

  it('allows platform admin adminSupport for any store', async () => {
    const business = makeBusiness();
    const draft = makeDraft({ committedStoreId: 'store_1' });
    const prisma = makePrisma({ business, draft });
    const ctx = await resolveWebsiteEditingContext(prisma, {
      storeId: 'store_1',
      userId: 'admin_1',
      user: admin,
      adminSupport: true,
    });
    expect(ctx.ok).toBe(true);
    expect(ctx.adminSupport).toBe(true);
    expect(ctx.liveUnchanged).toBe(true);
  });

  it('fails clearly for unknown store', async () => {
    const prisma = makePrisma({ business: null, draft: null });
    await expect(
      resolveWebsiteEditingContext(prisma, {
        storeId: 'missing',
        userId: 'owner_1',
        user: owner,
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'store_not_found' });
  });

  it('translates legacy generationRunId into draft context without requiring storeId', async () => {
    const draft = makeDraft({
      id: 'draft_run',
      ownerUserId: 'owner_1',
      committedStoreId: null,
      generationRunId: 'run_abc',
      input: { generationRunId: 'run_abc' },
      preview: { storeName: 'Temp Draft', meta: {} },
    });
    const prisma = {
      business: { findUnique: vi.fn(async () => null) },
      draftStore: {
        findUnique: vi.fn(async () => null),
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => [draft]),
      },
      product: { findMany: vi.fn(async () => []) },
      orchestratorTask: {
        findMany: vi.fn(async () => []),
      },
    };
    const ctx = await resolveWebsiteEditingContext(prisma, {
      generationRunId: 'run_abc',
      userId: 'owner_1',
      user: owner,
      allowInit: false,
    });
    expect(ctx.ok).toBe(true);
    expect(ctx.draftId).toBe('draft_run');
    expect(ctx.editingKind).toBe(WEBSITE_EDITING_KINDS.GENERATED_DRAFT);
    expect(ctx.liveUnchanged).toBe(true);
  });

  it('reopening Website Editing is idempotent (reuses existing draft)', async () => {
    const business = makeBusiness();
    const draft = makeDraft({ committedStoreId: 'store_1' });
    const prisma = makePrisma({ business, draft });
    const a = await resolveWebsiteEditingContext(prisma, {
      storeId: 'store_1',
      userId: 'owner_1',
      user: owner,
    });
    const b = await resolveWebsiteEditingContext(prisma, {
      storeId: 'store_1',
      userId: 'owner_1',
      user: owner,
    });
    expect(a.draftId).toBe(b.draftId);
    expect(a.initializedRevision).toBe(false);
    expect(b.initializedRevision).toBe(false);
  });

  it('opening Website Editing never mutates published storefront flags', async () => {
    const business = makeBusiness({ isActive: true, publishedAt: new Date() });
    const draft = makeDraft({ committedStoreId: 'store_1' });
    const prisma = makePrisma({ business, draft });
    prisma.business.update = vi.fn();
    const ctx = await resolveWebsiteEditingContext(prisma, {
      storeId: 'store_1',
      userId: 'owner_1',
      user: owner,
    });
    expect(ctx.liveUnchanged).toBe(true);
    expect(prisma.business.update).not.toHaveBeenCalled();
  });
});
