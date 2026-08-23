import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnrichmentBudget } from '../budget.js';
import { fetchFoursquarePhotos, fetchFoursquareVenue } from '../foursquareFetcher.js';
import { __test as fullNameTest } from '../fullNameRecovery.js';
import { nameMatchConfidence } from '../wikimediaFetcher.js';
import { queryOsmOverpass } from '../osmCrossRef.js';

describe('foursquareFetcher', () => {
  afterEach(() => {
    delete process.env.FOURSQUARE_API_KEY;
    vi.unstubAllGlobals();
  });

  it('skips silently when FOURSQUARE_API_KEY not set', async () => {
    const budget = new EnrichmentBudget();
    const result = await fetchFoursquareVenue(budget, 'Braybrook Hotel', 'Braybrook');
    expect(result).toBeNull();
    expect(budget.websiteFetches).toBe(0);
  });

  it('filters photos narrower than 800px', async () => {
    process.env.FOURSQUARE_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { prefix: 'https://img/', suffix: '/a.jpg', width: 400, height: 300 },
          { prefix: 'https://img/', suffix: '/b.jpg', width: 1200, height: 800 },
        ],
      })),
    );
    const budget = new EnrichmentBudget();
    const photos = await fetchFoursquarePhotos(budget, 'fsq-1');
    expect(photos).toHaveLength(1);
    expect(photos[0]?.url).toContain('original');
  });

  it('uses Bearer auth and version header on venue search', async () => {
    process.env.FOURSQUARE_API_KEY = 'test-key';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            fsq_place_id: 'abc123',
            name: 'Braybrook Bakehouse',
            categories: [{ name: 'Bakery' }],
          },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const budget = new EnrichmentBudget();
    const result = await fetchFoursquareVenue(budget, 'Braybrook Bakehouse', 'Braybrook');
    expect(result?.fsqId).toBe('abc123');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(init.headers?.Authorization)).toBe('Bearer test-key');
    expect(init.headers?.['X-Places-Api-Version']).toBe('2025-06-17');
    expect(String(init.headers?.Accept)).toBe('application/json');
  });
});

describe('fullNameRecovery helpers', () => {
  it('extracts business name from YP title format', () => {
    expect(fullNameTest.cleanYpTitle('Churchill Cellars | Yellow Pages®')).toBe('Churchill Cellars');
  });
});

describe('wikimedia name match', () => {
  it('scores high when file title contains business name', () => {
    expect(
      nameMatchConfidence('Lune Croissanterie', 'File:Lune Croissanterie Fitzroy.jpg'),
    ).toBeGreaterThan(0.85);
  });

  it('scores low for unrelated titles', () => {
    expect(nameMatchConfidence('Braybrook Hotel', 'File:Random streetscape.jpg')).toBeLessThan(
      0.85,
    );
  });
});

describe('osmOverpass timeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null on abort without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      }),
    );
    const budget = new EnrichmentBudget();
    const result = await queryOsmOverpass(budget, 'Braybrook Hotel', 'Braybrook');
    expect(result).toBeNull();
  });
});
