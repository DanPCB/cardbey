import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import {
  OsmDiscoveryProvider,
  resetOsmThrottleForTests,
  setOverpassRequestDelayForTests,
  buildOverpassQuery,
} from '../../discoveryEngine/providers/OsmDiscoveryProvider.js';
import { DiscoveryProviderRateLimitError } from '../../discoveryEngine/providers/discoveryProviderErrors.js';
import {
  resetDiscoveryProviderConfigForTests,
} from '../../discoveryEngine/config/discoveryProviderConfig.js';
import { DiscoveryProviderManager } from '../../discoveryEngine/providers/DiscoveryProviderManager.js';
import * as cacheModule from '../../discoveryEngine/providers/discoveryProviderCache.js';

vi.mock('../../discoveryEngine/providers/GooglePlacesDiscoveryProvider.js', () => ({
  googlePlacesDiscoveryProvider: {
    discover: vi.fn(async () => []),
  },
}));

vi.mock('../../businessDiscovery/businessDiscoverySources.js', () => ({
  isGooglePlacesConfigured: vi.fn(() => false),
}));

function mockFetchSequence(responses: Array<{ status: number; body?: unknown; retryAfter?: string }>) {
  let call = 0;
  return vi.fn(async () => {
    const spec = responses[call] ?? responses[responses.length - 1]!;
    call += 1;
    return {
      ok: spec.status >= 200 && spec.status < 300,
      status: spec.status,
      headers: {
        get: (k: string) => (k === 'retry-after' ? spec.retryAfter ?? null : null),
      },
      json: async () => spec.body ?? { elements: [] },
    } as Response;
  });
}

describe('OsmDiscoveryProvider rate limit resilience', () => {
  beforeEach(() => {
    resetOsmThrottleForTests();
    setOverpassRequestDelayForTests(0);
    resetDiscoveryProviderConfigForTests();
    process.env.DISCOVERY_OVERPASS_MAX_RETRIES = '2';
    process.env.DISCOVERY_OVERPASS_BACKOFF_MS = '10';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DISCOVERY_OVERPASS_MAX_RETRIES;
    delete process.env.DISCOVERY_OVERPASS_BACKOFF_MS;
  });

  it('returns structured RATE_LIMITED error after retries exhausted', async () => {
    const fetchImpl = mockFetchSequence([
      { status: 200, body: [{ boundingbox: ['-38', '-37', '144', '145'] }] },
      { status: 429, retryAfter: '30' },
      { status: 429, retryAfter: '30' },
      { status: 429, retryAfter: '30' },
    ]);

    const provider = new OsmDiscoveryProvider({ fetchImpl });

    await expect(
      provider.discoverGrouped({
        city: 'Braybrook',
        tags: ['amenity=restaurant'],
        limit: 5,
        suburb: 'Braybrook',
        categories: ['Restaurant'],
      }),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      provider: 'osm_overpass',
      suburb: 'Braybrook',
      retryAfterSeconds: 30,
    });
  });

  it('retries on 429 and succeeds on later attempt', async () => {
    const fetchImpl = mockFetchSequence([
      { status: 200, body: [{ boundingbox: ['-38', '-37', '144', '145'] }] },
      { status: 429 },
      { status: 200, body: { elements: [{ type: 'node', id: 1, lat: -37.8, lon: 144.9, tags: { name: 'Test Cafe', amenity: 'cafe' } }] } },
    ]);

    const provider = new OsmDiscoveryProvider({ fetchImpl });
    const { candidates, retryCount } = await provider.discoverGrouped({
      city: 'Footscray',
      tags: ['amenity=cafe'],
      limit: 5,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.businessName).toBe('Test Cafe');
    expect(retryCount).toBeGreaterThanOrEqual(1);
  });

  it('groups multiple category tags into one Overpass query', () => {
    const query = buildOverpassQuery(
      { south: -38, west: 144, north: -37, east: 145 },
      ['amenity=restaurant', 'amenity=cafe', 'shop=bakery'],
      25,
    );
    expect(query).toContain('amenity"="restaurant"');
    expect(query).toContain('amenity"="cafe"');
    expect(query).toContain('shop"="bakery"');
    expect(query.match(/node\[/g)?.length).toBe(3);
  });
});

describe('DiscoveryProviderManager batch partial success', () => {
  beforeEach(() => {
    resetOsmThrottleForTests();
    setOverpassRequestDelayForTests(0);
    vi.restoreAllMocks();
  });

  it('429 on one suburb does not fail entire batch when another suburb succeeds', async () => {
    const manager = new DiscoveryProviderManager();
    const discoverGrouped = vi
      .fn()
      .mockRejectedValueOnce(
        new DiscoveryProviderRateLimitError({
          suburb: 'Braybrook',
          categories: ['Restaurant'],
        }),
      )
      .mockResolvedValueOnce({
        candidates: [
          {
            providerId: 'osm',
            externalId: 'node/2',
            businessName: 'Sunshine Cafe',
            category: 'cafe',
            address: null,
            city: 'Sunshine',
            state: null,
            postcode: null,
            country: null,
            latitude: -37.8,
            longitude: 144.8,
            phone: null,
            email: null,
            website: null,
            socialProfiles: [],
            sourceUrl: null,
            discoveredAt: new Date().toISOString(),
            confidence: 0.8,
            metadata: { osmTags: { amenity: 'cafe', name: 'Sunshine Cafe' } },
          },
        ],
        retryCount: 1,
      });

    vi.spyOn(
      (await import('../../discoveryEngine/providers/OsmDiscoveryProvider.js')).osmDiscoveryProvider,
      'discoverGrouped',
    ).mockImplementation(discoverGrouped);

    vi.spyOn(cacheModule, 'readDiscoveryCache').mockResolvedValue(null);
    vi.spyOn(cacheModule, 'writeDiscoveryCache').mockResolvedValue(undefined);

    const result = await manager.runBatch({
      suburbs: ['Braybrook', 'Sunshine'],
      categories: ['Restaurant'],
      maxResults: 10,
      dryRun: true,
      provider: 'osm',
    });

    expect(result.status).toBe('partial');
    expect(result.fetchedCount).toBe(1);
    expect(result.rateLimitedSearches).toBe(1);
    expect(discoverGrouped).toHaveBeenCalledTimes(2);
  });

  it('uses cached data when provider is rate limited', async () => {
    const manager = new DiscoveryProviderManager();
    vi.spyOn(
      (await import('../../discoveryEngine/providers/OsmDiscoveryProvider.js')).osmDiscoveryProvider,
      'discoverGrouped',
    ).mockRejectedValue(
      new DiscoveryProviderRateLimitError({ suburb: 'Braybrook', categories: ['Cafe'] }),
    );

    vi.spyOn(cacheModule, 'readDiscoveryCache').mockResolvedValue({
      provider: 'osm',
      suburb: 'Braybrook',
      categoryGroup: ['Cafe'],
      maxResults: 10,
      dateBucket: '2026-06-27',
      cachedAt: new Date().toISOString(),
      candidates: [
        {
          providerId: 'osm',
          externalId: 'node/9',
          businessName: 'Cached Cafe',
          category: 'cafe',
          address: null,
          city: 'Braybrook',
          state: null,
          postcode: null,
          country: null,
          latitude: -37.8,
          longitude: 144.8,
          phone: null,
          email: null,
          website: null,
          socialProfiles: [],
          sourceUrl: null,
          discoveredAt: new Date().toISOString(),
          confidence: 0.8,
          metadata: { osmTags: { amenity: 'cafe', name: 'Cached Cafe' } },
        },
      ],
    });

    const result = await manager.runBatch({
      suburbs: ['Braybrook'],
      categories: ['Cafe'],
      maxResults: 10,
      dryRun: true,
      provider: 'osm',
    });

    expect(result.usedCache).toBe(true);
    expect(result.fetchedCount).toBe(1);
    expect(result.candidates[0]?.businessName).toBe('Cached Cafe');
  });

  it('5 suburbs × 8 categories produces 5 grouped Overpass calls not 40', async () => {
    const manager = new DiscoveryProviderManager();
    const discoverGrouped = vi.fn(async () => ({ candidates: [], retryCount: 0 }));
    vi.spyOn(
      (await import('../../discoveryEngine/providers/OsmDiscoveryProvider.js')).osmDiscoveryProvider,
      'discoverGrouped',
    ).mockImplementation(discoverGrouped);
    vi.spyOn(cacheModule, 'readDiscoveryCache').mockResolvedValue(null);
    vi.spyOn(cacheModule, 'writeDiscoveryCache').mockResolvedValue(undefined);

    await manager.runBatch({
      suburbs: ['A', 'B', 'C', 'D', 'E'],
      categories: ['Bakery', 'Cafe', 'Restaurant', 'Nail salon', 'Hair salon', 'Grocery', 'Local retail', 'Home services'],
      maxResults: 25,
      dryRun: true,
      provider: 'osm',
    });

    expect(discoverGrouped).toHaveBeenCalledTimes(5);
    expect(discoverGrouped.mock.calls[0]?.[0]?.tags?.length).toBeGreaterThan(1);
  });
});
