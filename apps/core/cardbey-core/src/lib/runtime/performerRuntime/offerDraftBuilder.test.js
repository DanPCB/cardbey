import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildOfferDraftArtifact,
  buildRevisedOfferDraftArtifact,
  executeCreateOfferDraftBuild,
  executeReviseOfferDraftBuild,
} from './offerDraftBuilder.js';

vi.mock('../../prisma.js', () => ({
  getPrismaClient: vi.fn(),
}));

vi.mock('../../../services/draftStore/draftStoreService.js', () => ({
  getDraft: vi.fn(),
  getDraftByGenerationRunId: vi.fn(),
}));

import { getPrismaClient } from '../../prisma.js';

describe('offerDraftBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buildOfferDraftArtifact marks draft status and blocks publish', () => {
    const draft = buildOfferDraftArtifact(
      { missionId: 'm1', storeId: 'store-1', storeName: 'Cafe' },
      [{ id: 'p1', name: 'Latte', price: 5 }],
    );
    expect(draft.status).toBe('review_required');
    expect(draft.publishBlocked).toBe(true);
    expect(draft.requiresUserApproval).toBe(true);
    expect(draft.type).toBe('offer_draft');
    expect(draft.featuredProducts).toHaveLength(1);
  });

  it('executeCreateOfferDraftBuild does not publish or activate', async () => {
    vi.mocked(getPrismaClient).mockReturnValue({
      business: {
        findUnique: vi.fn().mockResolvedValue({ id: 'store-1', name: 'Cafe' }),
      },
      product: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'p1', name: 'Latte', price: 5, imageUrl: null, category: 'Drinks' },
        ]),
      },
    });

    const result = await executeCreateOfferDraftBuild({
      missionId: 'm1',
      storeId: 'store-1',
    });

    expect(result.ok).toBe(true);
    expect(result.output.published).toBe(false);
    expect(result.output.activated).toBe(false);
    expect(result.output.offerDraft.status).toBe('review_required');
  });

  it('buildOfferDraftArtifact includes version 1 metadata', () => {
    const draft = buildOfferDraftArtifact(
      { missionId: 'm1', storeId: 'store-1', storeName: 'Cafe' },
      [],
    );
    expect(draft.versionNumber).toBe(1);
    expect(draft.previousVersionId).toBeNull();
    expect(draft.versionChainId).toBe(draft.artifactId);
  });

  it('buildRevisedOfferDraftArtifact increments version and preserves chain', () => {
    const v1 = buildOfferDraftArtifact(
      { missionId: 'm1', storeId: 'store-1', storeName: 'Cafe' },
      [{ id: 'p1', name: 'Latte', price: 5 }],
    );
    const v2 = buildRevisedOfferDraftArtifact({
      previousOfferDraft: v1,
      revisionNotes: 'Shorter headline',
      createdFromExecutionId: 'exec-revise-1',
      missionId: 'm1',
      storeId: 'store-1',
      storeName: 'Cafe',
      products: v1.featuredProducts,
    });
    expect(v2.versionNumber).toBe(2);
    expect(v2.previousVersionId).toBe(v1.artifactId);
    expect(v2.revisionReason).toBe('Shorter headline');
    expect(v2.status).toBe('review_required');
    expect(v2.reviewDecision).toBeUndefined();
    expect(v2.versionChainId).toBe(v1.versionChainId);
  });

  it('executeReviseOfferDraftBuild requires revision notes', async () => {
    const v1 = buildOfferDraftArtifact(
      { missionId: 'm1', storeId: 'store-1', storeName: 'Cafe' },
      [],
    );
    const result = await executeReviseOfferDraftBuild({
      missionId: 'm1',
      storeId: 'store-1',
      previousOfferDraft: v1,
      revisionNotes: '   ',
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('revision_notes_required');
  });

  it('executeReviseOfferDraftBuild does not publish or activate', async () => {
    vi.mocked(getPrismaClient).mockReturnValue({
      business: {
        findUnique: vi.fn().mockResolvedValue({ id: 'store-1', name: 'Cafe' }),
      },
      product: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    });

    const v1 = buildOfferDraftArtifact(
      { missionId: 'm1', storeId: 'store-1', storeName: 'Cafe' },
      [],
    );
    const result = await executeReviseOfferDraftBuild({
      missionId: 'm1',
      storeId: 'store-1',
      previousOfferDraft: v1,
      revisionNotes: 'Update CTA copy',
    });

    expect(result.ok).toBe(true);
    expect(result.output.published).toBe(false);
    expect(result.output.activated).toBe(false);
    expect(result.output.offerDraft.versionNumber).toBe(2);
    expect(result.output.offerDraft.status).toBe('review_required');
    expect(result.output.previousOfferDraftId).toBe(v1.artifactId);
  });
});
