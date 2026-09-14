/**
 * Acquire path unit — mocks prisma + policy.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ACQUISITION_DECISION } from '../acquisitionDecision.js';

describe('acquireCandidateToLibrary', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('refuses BLOCKED / REFERENCE_ONLY without review approval', async () => {
    vi.doMock('../../universalLibrary/providerRemoteLookup.js', () => ({
      findAssetByProviderRemoteId: async () => null,
    }));
    vi.doMock('../../universalLibrary/universalAssetService.js', () => ({
      createUniversalAsset: async () => ({ ok: true, asset: { id: 'a1' } }),
      publishUniversalAsset: async () => ({ ok: true, asset: { id: 'a1' } }),
    }));

    const { acquireCandidateToLibrary } = await import('../acquireToLibrary.js');
    const blocked = await acquireCandidateToLibrary(
      {},
      {
        provider: 'tiktok',
        providerAssetId: '1',
        title: 'clip',
        license: 'n/a',
        acquisitionDecision: ACQUISITION_DECISION.REFERENCE_ONLY,
        canAcquire: false,
      },
    );
    expect(blocked.ok).toBe(false);
    expect(['requires_review', 'acquisition_blocked', 'blocked_by_policy']).toContain(
      blocked.error,
    );
  });

  it('persists provenance for safe Pexels REMOTE_REUSE', async () => {
    let createdInput = null;
    vi.doMock('../../universalLibrary/providerRemoteLookup.js', () => ({
      findAssetByProviderRemoteId: async () => null,
    }));
    vi.doMock('../../universalLibrary/universalAssetService.js', () => ({
      createUniversalAsset: async (_p, input) => {
        createdInput = input;
        return {
          ok: true,
          asset: {
            id: 'asset_1',
            ...input,
            rightsStatus: input.rightsStatus,
            hostingMode: input.hostingMode,
          },
        };
      },
      publishUniversalAsset: async (_p, id) => ({
        ok: true,
        asset: { id, status: 'PUBLISHED', rightsStatus: 'CLEARED', hostingMode: 'REFERENCE' },
      }),
    }));

    const prisma = {
      universalAsset: {
        findFirst: async () => null,
      },
    };

    const { acquireCandidateToLibrary } = await import('../acquireToLibrary.js');
    const result = await acquireCandidateToLibrary(
      prisma,
      {
        provider: 'pexels',
        providerAssetId: '42',
        title: 'Bakery',
        mediaType: 'image',
        license: 'Pexels License',
        sourceUrl: 'https://www.pexels.com/photo/42/',
        previewUrl: 'https://images.pexels.com/x.jpg',
        providerHostedUrl: 'https://images.pexels.com/x-full.jpg',
        creator: 'Ada',
        attributionText: 'Photo by Ada on Pexels',
        acquisitionDecision: ACQUISITION_DECISION.REMOTE_REUSE,
        custodyMode: 'PROVIDER_HOSTED',
        canAcquire: true,
        canDownload: false,
        relevanceScore: 80,
        qualityScore: 85,
        rightsConfidence: 95,
        retrievedAt: '2026-01-01T00:00:00.000Z',
        tags: ['bakery'],
        industryTags: ['food-drink'],
        sourceMetadata: { raw: true },
      },
      { userId: 'user_1' },
    );

    expect(result.ok).toBe(true);
    expect(result.downloaded).toBe(false);
    expect(createdInput.metadata.provenance.provider).toBe('pexels');
    expect(createdInput.metadata.provenance.providerAssetId).toBe('42');
    expect(createdInput.metadata.provenance.rightsDecision).toBe(
      ACQUISITION_DECISION.REMOTE_REUSE,
    );
    expect(createdInput.metadata.provenance.contentHash).toBeNull();
    expect(createdInput.hostingMode).toBe('REFERENCE');
  });
});
