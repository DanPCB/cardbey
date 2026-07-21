import { describe, expect, it, beforeEach, vi } from 'vitest';
import { resetBusinessCandidatesForTests } from '../candidateRepository.js';
import { runRealLocalDiscovery, MELBOURNE_BATCH001_REAL_LOCAL_ID } from '../realLocalDiscoveryService.js';

const mockRunBatch = vi.fn();

vi.mock('../../discoveryEngine/providers/DiscoveryProviderManager.js', () => ({
  discoveryProviderManager: {
    runBatch: (...args: unknown[]) => mockRunBatch(...args),
  },
}));

function sampleCandidate(city: string, name: string) {
  return {
    providerId: 'osm' as const,
    externalId: `osm-${city}-${name}`,
    businessName: name,
    category: 'cafe',
    address: `1 Test St, ${city} VIC`,
    city,
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
    metadata: { suburb: city, pilotCategory: 'Cafe' },
  };
}

describe('runRealLocalDiscovery', () => {
  beforeEach(async () => {
    await resetBusinessCandidatesForTests();
    vi.clearAllMocks();
    mockRunBatch.mockResolvedValue({
      provider: 'osm',
      status: 'success',
      fetchedCount: 1,
      savedCount: 0,
      duplicatesSkipped: 0,
      rateLimitedCount: 0,
      providerErrors: [],
      usedFallback: false,
      usedCache: false,
      retryCount: 0,
      successfulSearches: 1,
      skippedSearches: 0,
      rateLimitedSearches: 0,
      rateLimitedCategories: [],
      skippedCategories: [],
      overpassRequestCount: 1,
      requestsPerMinute: 50,
      candidates: [sampleCandidate('Footscray', 'Test Cafe')],
      technicalErrors: [],
    });
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

  it('surfaces partial success metrics when provider rate limits', async () => {
    mockRunBatch.mockResolvedValue({
      provider: 'osm',
      status: 'partial',
      fetchedCount: 10,
      savedCount: 0,
      duplicatesSkipped: 0,
      rateLimitedCount: 4,
      providerErrors: [
        {
          code: 'RATE_LIMITED',
          provider: 'osm_overpass',
          message: 'Overpass HTTP 429',
          suburb: 'Braybrook',
          categories: ['Restaurant', 'Nail salon'],
        },
      ],
      usedFallback: false,
      usedCache: false,
      retryCount: 2,
      successfulSearches: 1,
      skippedSearches: 4,
      rateLimitedSearches: 1,
      rateLimitedCategories: [
        { suburb: 'Braybrook', category: 'Restaurant' },
        { suburb: 'Braybrook', category: 'Nail salon' },
      ],
      skippedCategories: ['Restaurant', 'Nail salon'],
      overpassRequestCount: 5,
      requestsPerMinute: 50,
      candidates: Array.from({ length: 10 }, (_, i) => sampleCandidate('Sunshine', `Biz ${i}`)),
      technicalErrors: ['Braybrook: Overpass HTTP 429'],
    });

    const result = await runRealLocalDiscovery({
      batchId: MELBOURNE_BATCH001_REAL_LOCAL_ID,
      suburbs: REAL_LOCAL_SUBURBS,
      categories: ['Restaurant'],
      maxResults: 25,
      dryRun: true,
      provider: 'osm',
    });

    expect(result.status).toBe('partial');
    expect(result.candidatesFound).toBe(10);
    expect(result.rateLimitedCount).toBe(4);
    expect(result.providerErrors?.[0]?.code).toBe('RATE_LIMITED');
  });
});

const REAL_LOCAL_SUBURBS = ['Braybrook', 'Sunshine', 'St Albans', 'Footscray', 'Sunshine North'];
