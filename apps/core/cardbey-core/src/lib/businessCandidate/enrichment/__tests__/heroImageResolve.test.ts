import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnrichmentBudget } from '../budget.js';
import { resolveHeroImage } from '../heroImageResolve.js';

describe('resolveHeroImage Pexels acceptance', () => {
  afterEach(() => {
    delete process.env.PEXELS_API_KEY;
    vi.unstubAllGlobals();
  });

  it('accepts SUCCESS Pexels hits (status check, not missing .ok)', async () => {
    process.env.PEXELS_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          photos: [
            {
              width: 1600,
              src: { large2x: 'https://images.pexels.com/photos/1/large.jpg' },
            },
          ],
        }),
      })),
    );

    const budget = new EnrichmentBudget();
    const resolved = await resolveHeroImage({
      budget,
      websiteOgImage: null,
      websiteSourceUrl: null,
      category: 'Food & Drink',
      businessType: 'bakery',
      businessName: 'Braybrook Bakehouse',
      suburb: 'Braybrook',
      placesTypes: null,
      tags: ['bakery'],
      identityMatchedWebsite: false,
    });

    expect(resolved.status).toBe('SUCCESS');
    expect(resolved.hero?.eligible).toBe(true);
    expect(resolved.hero?.source).toBe('pexels');
    expect(resolved.hero?.url).toContain('pexels.com');
  });
});
