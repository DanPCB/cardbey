import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  canonicalizeServiceTitle,
  buildServiceImageIntent,
  normalizeServiceKey,
} from '../serviceImageIntentResolver.js';
import { evaluateServiceMismatchGuard } from '../serviceImageMismatchGuards.js';
import {
  scoreServiceImageCandidateMetadata,
  STRONG_MATCH,
  ACCEPTABLE_MATCH,
} from '../serviceImageCandidateScorer.js';
import { dedupeServiceCatalogItems } from '../serviceCatalogDedupe.js';
import { ServiceImageRegistry } from '../serviceImageRegistry.js';
import { resolveServiceImageForItem } from '../serviceImageResolver.js';

vi.mock('../menuVisualAgent/pexelsService.ts', () => ({
  isPexelsAvailable: vi.fn(() => true),
  searchPexelsImages: vi.fn(),
}));

import { searchPexelsImages, isPexelsAvailable } from '../menuVisualAgent/pexelsService.ts';
import { clearServiceImageSearchCache } from '../serviceImageCache.js';

describe('serviceImageIntentResolver', () => {
  it('canonicalises Door Repair - Chef\'s to Door Repair', () => {
    expect(canonicalizeServiceTitle("Door Repair - Chef's")).toBe('Door Repair');
    expect(canonicalizeServiceTitle("Fence Repair - Chef's")).toBe('Fence Repair');
  });

  it('leaves TV Wall Mounting unchanged', () => {
    expect(canonicalizeServiceTitle('TV Wall Mounting')).toBe('TV Wall Mounting');
    expect(canonicalizeServiceTitle('Minor Electrical Assistance')).toBe('Minor Electrical Assistance');
  });

  it('builds gutter cleaning queries with gutter/roof/ladder terms', () => {
    const intent = buildServiceImageIntent({ serviceName: 'Gutter Cleaning' });
    const blob = intent.queries.join(' ').toLowerCase();
    expect(blob).toMatch(/gutter/);
    expect(blob).toMatch(/roof|ladder|leaves|downpipe/);
    expect(intent.queries.every((q) => !/^(repair|maintenance|handyman)$/i.test(q.trim()))).toBe(true);
  });
});

describe('serviceImageCandidateScorer', () => {
  const fenceIntent = buildServiceImageIntent({ serviceName: 'Fence Repair' });

  it('ranks fence repair candidate above faucet photo', () => {
    const fence = scoreServiceImageCandidateMetadata(fenceIntent, {
      provider: 'pexels',
      imageUrl: 'https://example.com/fence.jpg',
      altText: 'handyman repairing wooden fence panel outdoor',
      sourceQuery: 'handyman repairing wooden fence panel',
    });
    const faucet = scoreServiceImageCandidateMetadata(fenceIntent, {
      provider: 'pexels',
      imageUrl: 'https://example.com/tap.jpg',
      altText: 'dripping tap faucet sink plumbing',
      sourceQuery: 'repair service',
    });
    expect(fence.metadataScore).toBeGreaterThan(faucet.metadataScore);
    expect(faucet.hardReject || faucet.metadataScore < ACCEPTABLE_MATCH).toBe(true);
  });

  it('rejects salon image for gutter cleaning via mismatch guard', () => {
    const gutterIntent = buildServiceImageIntent({ serviceName: 'Gutter Cleaning' });
    const guard = evaluateServiceMismatchGuard(
      gutterIntent.canonicalTitle,
      'salon beauty treatment hair styling',
    );
    expect(guard.pass).toBe(false);
  });

  it('prefers TV wall mount over bedroom without TV', () => {
    const tvIntent = buildServiceImageIntent({ serviceName: 'TV Wall Mounting' });
    const tv = scoreServiceImageCandidateMetadata(tvIntent, {
      provider: 'pexels',
      imageUrl: 'https://example.com/tv.jpg',
      altText: 'technician mounting television wall bracket living room',
      sourceQuery: 'TV wall mount installation',
    });
    const bed = scoreServiceImageCandidateMetadata(tvIntent, {
      provider: 'pexels',
      imageUrl: 'https://example.com/bed.jpg',
      altText: 'bedroom interior design bed only',
      sourceQuery: 'bedroom',
    });
    expect(tv.metadataScore).toBeGreaterThan(bed.metadataScore);
  });
});

describe('serviceCatalogDedupe', () => {
  it('merges Door Repair and Door Repair - Chef\'s', () => {
    const { items, removedCount } = dedupeServiceCatalogItems([
      { name: 'Door Repair', price: 120, description: 'Fix doors' },
      { name: "Door Repair - Chef's", price: 0 },
      { name: "Fence Repair - Chef's", price: 180 },
      { name: 'Fence Repair', price: 200, description: 'Timber fence' },
    ]);
    expect(removedCount).toBe(2);
    expect(items.map((i) => i.name).sort()).toEqual(['Door Repair', 'Fence Repair']);
  });
});

describe('ServiceImageRegistry', () => {
  it('blocks duplicate image across unrelated services', () => {
    const registry = new ServiceImageRegistry();
    registry.register('fence repair:repairs', { providerAssetId: '123', imageUrl: 'https://x/a.jpg' });
    expect(
      registry.isDuplicate('flyscreen repair:repairs', {
        providerAssetId: '123',
        imageUrl: 'https://x/a.jpg',
      }),
    ).toBe(true);
  });
});

describe('resolveServiceImageForItem integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearServiceImageSearchCache();
    process.env.PEXELS_API_KEY = 'vitest-test-key';
    isPexelsAvailable.mockReturnValue(true);
  });

  it('selects semantically matching image and persists provenance', async () => {
    const candidateFetcher = async (intent) => {
      const good = {
        provider: 'pexels',
        providerAssetId: '1',
        imageUrl: 'https://images.pexels.com/fence.jpg',
        thumbnailUrl: 'https://images.pexels.com/fence-t.jpg',
        altText: 'handyman repairing wooden fence panel',
        sourceQuery: intent.queries[0],
      };
      const bad = {
        provider: 'pexels',
        providerAssetId: '2',
        imageUrl: 'https://images.pexels.com/tap.jpg',
        thumbnailUrl: 'https://images.pexels.com/tap-t.jpg',
        altText: 'dripping tap faucet sink plumbing',
        sourceQuery: 'generic repair',
      };
      return [good, bad];
    };

    const result = await resolveServiceImageForItem({
      serviceName: 'Fence Repair',
      businessCategory: 'handyman',
      storeName: 'CA HANDYMAN',
      candidateFetcher,
    });

    expect(result).not.toBeNull();
    expect(result?.url).toContain('fence');
    expect(result?.confidence).toBeGreaterThanOrEqual(ACCEPTABLE_MATCH);
    expect(result?.imageSelection?.canonicalService).toBe('Fence Repair');
    expect(result?.imageSelection?.matchStatus).toMatch(/strong|acceptable/);
  });

  it('returns null instead of unrelated weak candidate', async () => {
    const candidateFetcher = async () => [
      {
        provider: 'pexels',
        providerAssetId: '99',
        imageUrl: 'https://images.pexels.com/meeting.jpg',
        thumbnailUrl: 'https://images.pexels.com/meeting-t.jpg',
        altText: 'office business meeting conference table',
        sourceQuery: 'flyscreen repair',
      },
    ];

    const result = await resolveServiceImageForItem({
      serviceName: 'Flyscreen Repair',
      businessCategory: 'handyman',
      candidateFetcher,
    });

    expect(result).toBeNull();
  });

  it('handyman store batch avoids duplicate assignments', async () => {
    const services = [
      'Door Repair',
      'Fence Repair',
      'Gutter Cleaning',
      'TV Wall Mounting',
    ];
    const candidateFetcher = async (intent) => [
      {
        provider: 'pexels',
        providerAssetId: intent.canonicalTitle,
        imageUrl: `https://images.pexels.com/${normalizeServiceKey(intent.canonicalTitle)}.jpg`,
        thumbnailUrl: 'https://images.pexels.com/t.jpg',
        altText: intent.queries[0],
        sourceQuery: intent.queries[0],
      },
    ];

    const { ServiceImageRegistry } = await import('../serviceImageRegistry.js');
    const registry = new ServiceImageRegistry();
    const urls = new Set();

    for (const serviceName of services) {
      const row = await resolveServiceImageForItem({
        serviceName,
        businessCategory: 'handyman',
        registry,
        candidateFetcher,
      });
      if (row?.url) {
        expect(urls.has(row.url)).toBe(false);
        urls.add(row.url);
      }
    }
  });
});

describe('CA Handyman regression scoring', () => {
  const cases = [
    {
      service: 'Fence Repair',
      good: 'tradesperson fixing timber fence panel outdoor',
      bad: 'dripping tap faucet plumbing sink',
    },
    {
      service: 'Flyscreen Repair',
      good: 'window flyscreen mesh repair rescreening',
      bad: 'office business meeting conference',
    },
    {
      service: 'Gutter Cleaning',
      good: 'worker cleaning roof gutter on ladder',
      bad: 'salon beauty hair treatment',
    },
    {
      service: 'TV Wall Mounting',
      good: 'installer mounting television wall bracket',
      bad: 'bedroom interior bed design no television',
    },
    {
      service: 'Shelf Installation',
      good: 'handyman installing floating wall shelf',
      bad: 'exterior plumbing pipes outdoor',
    },
  ];

  cases.forEach(({ service, good, bad }) => {
    it(`${service}: good alt outranks bad alt`, () => {
      const intent = buildServiceImageIntent({ serviceName: service });
      const goodScore = scoreServiceImageCandidateMetadata(intent, {
        provider: 'pexels',
        imageUrl: 'https://example.com/good.jpg',
        altText: good,
        sourceQuery: intent.queries[0],
      });
      const badScore = scoreServiceImageCandidateMetadata(intent, {
        provider: 'pexels',
        imageUrl: 'https://example.com/bad.jpg',
        altText: bad,
        sourceQuery: 'generic repair',
      });
      expect(goodScore.metadataScore).toBeGreaterThan(badScore.metadataScore);
    });
  });
});
