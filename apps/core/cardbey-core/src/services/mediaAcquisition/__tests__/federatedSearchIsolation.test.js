import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PROVIDER_STATUS } from '../federatedMediaSearch.js';

describe('federatedMediaSearch — source isolation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../../universalResourceIntelligence/sourceFederation.js');
    vi.doUnmock('../../universalResourceIntelligence/providerSdk/bootstrap.js');
    vi.doUnmock('../../universalResourceIntelligence/providerSdk/normalizeResource.js');
  });

  it('returns results from healthy sources when one adapter fails', async () => {
    vi.doMock('../../universalResourceIntelligence/providerSdk/bootstrap.js', () => ({
      bootstrapProviderAdapters: () => ({ ok: true }),
    }));

    const adapters = {
      src_pexels: {
        search: async () => {
          throw new Error('pexels_down');
        },
      },
      src_openverse: {
        search: async ({ query }) => ({
          ok: true,
          live: true,
          configured: true,
          hits: [
            {
              remoteId: 'ov1',
              kind: 'image',
              provider: 'openverse',
              title: `${query} bread`,
              previewUrl: 'https://example.com/t.jpg',
              canonicalUrl: 'https://example.com/ov1',
              license: 'CC BY 4.0',
              attributionText: 'CC BY',
              width: 1200,
              height: 800,
            },
          ],
        }),
      },
      src_wikimedia: {
        search: async () => ({ ok: true, hits: [], configured: true, live: true }),
      },
      src_pixabay: {
        search: async () => ({
          ok: true,
          configured: false,
          hits: [],
          note: 'PIXABAY_API_KEY required',
        }),
      },
      src_freesound: {
        search: async () => ({ ok: true, hits: [], configured: false }),
      },
    };

    vi.doMock('../../universalResourceIntelligence/sourceFederation.js', () => ({
      ensureFederationReady: async () => {},
      getAdapter: (id) => adapters[id] || null,
      consumeRateBudget: () => ({ ok: true }),
      openCircuit: () => {},
      recordAdapterHealth: () => {},
    }));

    vi.doMock('../../universalResourceIntelligence/providerSdk/normalizeResource.js', async () => {
      const actual = await vi.importActual(
        '../../universalResourceIntelligence/providerSdk/normalizeResource.js',
      );
      return actual;
    });

    const { runFederatedMediaSearch } = await import('../federatedMediaSearch.js');
    const result = await runFederatedMediaSearch({
      query: 'Vietnamese bakery advertising content',
      mediaType: 'image',
      limitPerSource: 4,
    });

    expect(result.ok).toBe(true);
    expect(result.expandedQueries?.length).toBeGreaterThan(0);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].provider).toBe('openverse');
    expect(result.candidates[0].acquisitionDecision).toBeTruthy();

    const bySource = Object.fromEntries(
      (result.sourceStatuses || []).map((s) => [s.sourceId, s.status]),
    );
    expect(bySource.src_pexels).toBe(PROVIDER_STATUS.FAILED);
    expect(bySource.src_openverse).toBe(PROVIDER_STATUS.SUCCESS);
    // One failure must not fail entire search
    expect(result.ok).toBe(true);
  });
});
