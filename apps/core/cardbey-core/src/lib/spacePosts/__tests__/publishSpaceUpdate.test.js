/**
 * Unit tests — publishSpaceUpdate (mocked prisma).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../storeReadiness/aggregator.js', () => ({
  assertStoreOwner: vi.fn(),
}));
vi.mock('../../authorization.js', () => ({
  isPlatformAdmin: vi.fn(() => false),
}));
vi.mock('../../feed/publicFeedRankBump.js', () => ({
  bumpPublicFeedRankForStore: vi.fn(async () => new Date('2026-08-27T00:00:00.000Z')),
}));
vi.mock('../../../services/storeShows/storeShowsService.js', () => ({
  upsertStoreShow: vi.fn(async () => ({ works: [{ id: 'show-1' }] })),
}));

import { assertStoreOwner } from '../../storeReadiness/aggregator.js';
import { bumpPublicFeedRankForStore } from '../../feed/publicFeedRankBump.js';
import { upsertStoreShow } from '../../../services/storeShows/storeShowsService.js';
import { publishSpaceUpdate } from '../publishSpaceUpdate.js';
import { PUBLIC_LIFECYCLE_EVENT_TYPES } from '../../publicStoreLifecycle/publicStoreLifecycleEvents.js';

describe('publishSpaceUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertStoreOwner.mockResolvedValue({ ok: true, business: { id: 's1', userId: 'u1' } });
  });

  function prismaMock(overrides = {}) {
    return {
      business: {
        findUnique: vi.fn().mockResolvedValue({
          id: 's1',
          userId: 'u1',
          name: 'Cafe',
          isActive: true,
          type: 'cafe',
          description: null,
        }),
      },
      product: { findFirst: vi.fn().mockResolvedValue({ id: 'p1' }) },
      promotion: { findFirst: vi.fn().mockResolvedValue({ id: 'pr1' }) },
      storeActivityEvent: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({
          id: 'evt-1',
          eventType: PUBLIC_LIFECYCLE_EVENT_TYPES.SPACE_UPDATE,
          createdAt: new Date('2026-08-27T00:00:00.000Z'),
          metadataJson: {
            title: 'Hello',
            description: 'World',
            public: true,
            entityId: 'idem-1',
            distribution: 'GLOBAL_ELIGIBLE',
            actorIdentity: 'business',
          },
        }),
      },
      ...overrides,
    };
  }

  it('rejects unauthenticated / non-owner', async () => {
    assertStoreOwner.mockResolvedValue({ ok: false, reason: 'forbidden' });
    const out = await publishSpaceUpdate(prismaMock(), {
      storeId: 's1',
      userId: 'intruder',
      text: 'hi',
    });
    expect(out.ok).toBe(false);
    expect(out.status).toBe(403);
  });

  it('rejects invalid media URL', async () => {
    const out = await publishSpaceUpdate(prismaMock(), {
      storeId: 's1',
      userId: 'u1',
      text: 'hi',
      mediaUrl: 'javascript:alert(1)',
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe('invalid_media_url');
  });

  it('publishes SPACE_UPDATE and bumps Global when GLOBAL_ELIGIBLE', async () => {
    const prisma = prismaMock();
    const out = await publishSpaceUpdate(prisma, {
      storeId: 's1',
      userId: 'u1',
      text: 'Breakfast menu is live',
      mediaUrl: 'https://cdn.example.com/a.jpg',
      distribution: 'GLOBAL_ELIGIBLE',
      idempotencyKey: 'idem-1',
    });
    expect(out.ok).toBe(true);
    expect(out.distribution).toBe('GLOBAL_ELIGIBLE');
    expect(out.globalRankBumped).toBe(true);
    expect(bumpPublicFeedRankForStore).toHaveBeenCalled();
    expect(upsertStoreShow).toHaveBeenCalled();
    expect(prisma.storeActivityEvent.create).toHaveBeenCalled();
    expect(out.event?.type).toBe('SPACE_UPDATE');
  });

  it('SPACE_ONLY does not bump Global rank', async () => {
    const out = await publishSpaceUpdate(prismaMock(), {
      storeId: 's1',
      userId: 'u1',
      text: 'Internal note',
      distribution: 'SPACE_ONLY',
      idempotencyKey: 'idem-2',
    });
    expect(out.ok).toBe(true);
    expect(out.globalRankBumped).toBe(false);
    expect(bumpPublicFeedRankForStore).not.toHaveBeenCalled();
  });

  it('dedupes by idempotency key', async () => {
    const prisma = prismaMock();
    prisma.storeActivityEvent.findMany.mockResolvedValue([
      { id: 'evt-1', metadataJson: { entityId: 'idem-1' } },
    ]);
    const out = await publishSpaceUpdate(prisma, {
      storeId: 's1',
      userId: 'u1',
      text: 'Breakfast menu is live',
      distribution: 'GLOBAL_ELIGIBLE',
      idempotencyKey: 'idem-1',
    });
    expect(out.ok).toBe(true);
    expect(out.deduped).toBe(true);
    expect(prisma.storeActivityEvent.create).not.toHaveBeenCalled();
    expect(bumpPublicFeedRankForStore).not.toHaveBeenCalled();
  });

  it('rejects cross-store catalog reference', async () => {
    const prisma = prismaMock();
    prisma.product.findFirst.mockResolvedValue(null);
    const out = await publishSpaceUpdate(prisma, {
      storeId: 's1',
      userId: 'u1',
      text: 'Product highlight',
      productId: 'other-store-product',
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe('invalid_catalog_reference');
  });
});
