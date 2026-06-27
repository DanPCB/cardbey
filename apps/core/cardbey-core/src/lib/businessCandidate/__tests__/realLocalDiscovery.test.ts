import { describe, expect, it, beforeEach, vi } from 'vitest';
import { resetBusinessCandidatesForTests } from '../candidateRepository.js';
import { runRealLocalDiscovery, MELBOURNE_BATCH001_REAL_LOCAL_ID } from '../realLocalDiscoveryService.js';

vi.mock('../../discoveryEngine/providers/GooglePlacesDiscoveryProvider.js', () => ({
  googlePlacesDiscoveryProvider: {
    discover: vi.fn(async () => []),
  },
}));

vi.mock('../../discoveryEngine/providers/OsmDiscoveryProvider.js', () => ({
  osmDiscoveryProvider: {
    discover: vi.fn(async (params: { city?: string; category?: string }) => [
      {
        providerId: 'osm',
        externalId: `osm-${params.city}-${params.category}`,
        businessName: `${params.category} Shop ${params.city}`,
        category: params.category ?? null,
        address: `1 Test St, ${params.city ?? 'Melbourne'} VIC`,
        city: params.city ?? null,
        state: 'VIC',
        postcode: '3011',
        country: 'AU',
        latitude: -37.8,
        longitude: 144.9,
        phone: null,
        email: null,
        website: null,
        socialProfiles: [],
        sourceUrl: null,
        discoveredAt: new Date().toISOString(),
        confidence: 0.7,
        metadata: { suburb: params.city },
      },
    ]),
  },
}));

describe('runRealLocalDiscovery', () => {
  beforeEach(async () => {
    await resetBusinessCandidatesForTests();
    vi.clearAllMocks();
  });

  it('dry run returns preview without persisting candidates', async () => {
    const result = await runRealLocalDiscovery({
      batchId: MELBOURNE_BATCH001_REAL_LOCAL_ID,
      suburbs: ['Footscray'],
      categories: ['Bakery'],
      maxResults: 5,
      dryRun: true,
      provider: 'osm',
    });

    expect(result.dryRun).toBe(true);
    expect(result.candidatesFound).toBeGreaterThan(0);
    expect(result.candidatesAccepted).toBe(0);
    expect(result.preview[0]?.suburb).toBe('Footscray');
    expect(result.batchId).toBe(MELBOURNE_BATCH001_REAL_LOCAL_ID);
  });

  it('live run persists BusinessCandidate with PENDING_QA status', async () => {
    const result = await runRealLocalDiscovery({
      batchId: MELBOURNE_BATCH001_REAL_LOCAL_ID,
      suburbs: ['Sunshine'],
      categories: ['Cafe'],
      maxResults: 5,
      dryRun: false,
      provider: 'osm',
    });

    expect(result.dryRun).toBe(false);
    expect(result.candidatesAccepted).toBeGreaterThan(0);
    expect(result.accepted?.[0]?.status).toBe('PENDING_QA');
    expect(result.accepted?.[0]?.batchId).toBe(MELBOURNE_BATCH001_REAL_LOCAL_ID);
    expect(result.accepted?.[0]?.storeDraftId).toBeNull();
    expect(result.accepted?.[0]?.seedId).toBeNull();
  });

  it('rejects Batch 0 overwrite', async () => {
    await expect(
      runRealLocalDiscovery({
        batchId: 'MELBOURNE_BATCH0_20260617',
        suburbs: ['Footscray'],
        categories: ['Bakery'],
        maxResults: 5,
        dryRun: true,
      }),
    ).rejects.toThrow(/Cannot overwrite Batch 0/);
  });
});
