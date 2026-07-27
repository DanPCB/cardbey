import { describe, it, expect, vi, beforeEach } from 'vitest';
import { distanceMeters } from '../storeMatchByVision.js';
import { buildGhostStorePreview } from '../ghostStorePreviewBuilder.js';
import { isGhostStoreRemoved, isPublicFeedEligibleBusiness } from '../../../utils/publicStoreVisibility.js';

const prismaMock = {
  business: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  draftStore: { create: vi.fn() },
  ghostStoreClaim: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  ghostStoreReport: { create: vi.fn(), count: vi.fn() },
  enrichedFieldProvenance: { create: vi.fn(), findMany: vi.fn() },
  user: { findFirst: vi.fn(), findUnique: vi.fn() },
  product: { create: vi.fn() },
};

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => prismaMock,
}));

vi.mock('../../businessColumnCapabilities.js', () => ({
  hasBusinessColumn: (col) =>
    ['provenance', 'claimStatus', 'captureCount', 'capturedByUserId'].includes(col) || col === 'provenance',
}));

vi.mock('../../storeMission/safePublishGeneratedDraft.js', () => ({
  safePublishGeneratedDraft: vi.fn(),
}));

vi.mock('../ghostStoreEnrichment.js', () => ({
  enrichGhostStoreAsync: vi.fn(),
}));

vi.mock('../../memory/episodicWriter.js', () => ({
  writeEpisodicEventAsync: vi.fn(),
}));

describe('ghostStore helpers', () => {
  it('distanceMeters is ~0 for same point', () => {
    expect(distanceMeters(-37.8, 144.9, -37.8, 144.9)).toBeLessThan(1);
  });

  it('buildGhostStorePreview avoids fabricated social proof sections', () => {
    const preview = buildGhostStorePreview({
      extraction: { businessName: 'Café Luna', category: 'Café', tagline: 'Fresh roasts' },
      location: { lat: -37.8, lng: 144.9 },
      heroImageUrl: '/uploads/media/vision-intake-1.jpg',
    });
    const types = preview.website.sections.map((s) => s.type);
    expect(types).toContain('hero');
    expect(types).toContain('about');
    expect(types).not.toContain('social_proof');
  });

  it('removed ghost stores are excluded from public feed eligibility', () => {
    expect(isGhostStoreRemoved({ claimStatus: 'removed' })).toBe(true);
    expect(isPublicFeedEligibleBusiness({ isActive: true, claimStatus: 'removed' })).toBe(false);
  });
});

describe('createGhostStore dedup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DISCOVERY_SYSTEM_USER_ID = 'system-user-1';
  });

  it('increments captureCount when ghost duplicate matches', async () => {
    const { safePublishGeneratedDraft } = await import('../../storeMission/safePublishGeneratedDraft.js');
    const { createGhostStore } = await import('../ghostStoreService.js');

    prismaMock.business.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'ghost-1',
          slug: 'cafe-luna',
          name: 'Café Luna',
          lat: -37.8,
          lng: 144.9,
          captureCount: 1,
          provenance: 'consumer_capture',
          claimStatus: 'unclaimed',
        },
      ]);
    prismaMock.business.update.mockResolvedValue({});

    const result = await createGhostStore({
      extraction: { businessName: 'Café Luna' },
      location: { lat: -37.8, lng: 144.9 },
      userId: 'user-1',
    });

    expect(result.deduped).toBe(true);
    expect(result.slug).toBe('cafe-luna');
    expect(safePublishGeneratedDraft).not.toHaveBeenCalled();
    expect(prismaMock.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ghost-1' },
        data: expect.objectContaining({ captureCount: { increment: 1 } }),
      }),
    );
  });

  it('publishes through runway with ghost flags on new store', async () => {
    const { safePublishGeneratedDraft } = await import('../../storeMission/safePublishGeneratedDraft.js');
    const { createGhostStore } = await import('../ghostStoreService.js');

    prismaMock.business.findMany.mockResolvedValue([]);
    prismaMock.draftStore.create.mockResolvedValue({ id: 'draft-1' });
    safePublishGeneratedDraft.mockResolvedValue({
      ok: true,
      storeId: 'store-new',
      storeSlug: 'cafe-luna',
    });
    prismaMock.business.update.mockResolvedValue({});

    const result = await createGhostStore({
      extraction: { businessName: 'Café Luna', category: 'Café' },
      location: { lat: -10, lng: 10 },
      imagePaths: ['/uploads/media/vision-intake-abc.jpg'],
      userId: 'user-2',
    });

    expect(result.ghost).toBe(true);
    expect(safePublishGeneratedDraft).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: 'draft-1', userId: 'system-user-1' }),
    );
    expect(prismaMock.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'store-new' },
        data: expect.objectContaining({
          provenance: 'consumer_capture',
          claimStatus: 'unclaimed',
        }),
      }),
    );
  });
});

describe('ghost claim lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('approve with verified user transfers ownership immediately', async () => {
    const { reviewGhostClaim } = await import('../ghostStoreService.js');
    prismaMock.ghostStoreClaim.findUnique.mockResolvedValue({
      id: 'claim-1',
      storeId: 'store-1',
      claimantEmail: 'owner@example.com',
      status: 'pending',
    });
    prismaMock.user.findFirst.mockResolvedValue({ id: 'user-verified', emailVerified: true });
    prismaMock.ghostStoreClaim.update.mockResolvedValue({});
    prismaMock.business.update.mockResolvedValue({});

    const result = await reviewGhostClaim('claim-1', { decision: 'approved' }, 'admin-1');
    expect(result.transferOutcome).toBe('completed');
    expect(prismaMock.business.update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: expect.objectContaining({ userId: 'user-verified', claimStatus: 'claimed', provenance: 'owner' }),
    });
  });

  it('approve without registered user defers to approved_pending_account', async () => {
    const { reviewGhostClaim } = await import('../ghostStoreService.js');
    prismaMock.ghostStoreClaim.findUnique.mockResolvedValue({
      id: 'claim-2',
      storeId: 'store-2',
      claimantEmail: 'new@example.com',
      status: 'pending',
    });
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.ghostStoreClaim.update.mockResolvedValue({});

    const result = await reviewGhostClaim('claim-2', { decision: 'approved' }, 'admin-1');
    expect(result.transferOutcome).toBe('approved_pending_account');
    expect(result.claimantAccountStatus).toBe('not_registered');
    expect(prismaMock.business.update).not.toHaveBeenCalled();
    expect(prismaMock.ghostStoreClaim.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'approved_pending_account' }),
      }),
    );
  });

  it('reject returns store to unclaimed', async () => {
    const { reviewGhostClaim } = await import('../ghostStoreService.js');
    prismaMock.ghostStoreClaim.findUnique.mockResolvedValue({
      id: 'claim-3',
      storeId: 'store-3',
      claimantEmail: 'x@example.com',
      status: 'pending',
    });
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.ghostStoreClaim.update.mockResolvedValue({});
    prismaMock.business.update.mockResolvedValue({});

    const result = await reviewGhostClaim('claim-3', { decision: 'rejected' }, 'admin-1');
    expect(result.decision).toBe('rejected');
    expect(prismaMock.business.update).toHaveBeenCalledWith({
      where: { id: 'store-3' },
      data: { claimStatus: 'unclaimed' },
    });
  });

  it('completePendingGhostClaimsForUser transfers after verification', async () => {
    const { completePendingGhostClaimsForUser } = await import('../ghostStoreService.js');
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-new',
      email: 'new@example.com',
      emailVerified: true,
    });
    prismaMock.ghostStoreClaim.findMany.mockResolvedValue([
      { id: 'claim-4', storeId: 'store-4', status: 'approved_pending_account' },
    ]);
    prismaMock.business.update.mockResolvedValue({});
    prismaMock.ghostStoreClaim.update.mockResolvedValue({});

    const result = await completePendingGhostClaimsForUser('user-new');
    expect(result.completed).toBe(1);
    expect(prismaMock.business.update).toHaveBeenCalledWith({
      where: { id: 'store-4' },
      data: expect.objectContaining({ userId: 'user-new', claimStatus: 'claimed' }),
    });
  });
});

describe('ghost reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes store after 3 open reports', async () => {
    const { submitGhostStoreReport } = await import('../ghostStoreService.js');
    prismaMock.business.findUnique.mockResolvedValue({ id: 'store-1', claimStatus: 'unclaimed' });
    prismaMock.ghostStoreReport.create.mockResolvedValue({ id: 'r1' });
    prismaMock.ghostStoreReport.count.mockResolvedValue(3);
    prismaMock.business.update.mockResolvedValue({});

    const result = await submitGhostStoreReport('store-1', { reason: 'inaccurate' });
    expect(result.removed).toBe(true);
    expect(prismaMock.business.update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: { claimStatus: 'removed', isActive: false },
    });
  });
});
