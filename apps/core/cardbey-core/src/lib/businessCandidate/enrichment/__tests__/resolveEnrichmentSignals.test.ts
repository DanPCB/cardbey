import { describe, expect, it } from 'vitest';
import {
  buildCategoryMappingInputFromCandidate,
  resolvePlacesTypesFromRawSource,
} from '../resolveEnrichmentSignals.js';

describe('resolveEnrichmentSignals', () => {
  it('reads types array from rawSourceJson', () => {
    expect(
      resolvePlacesTypesFromRawSource({
        types: ['bar', 'pub', 'hotel', 'establishment'],
        category: 'bar',
      }),
    ).toEqual(['bar', 'pub', 'hotel']);
  });

  it('falls back to category string when types array is missing (legacy rows)', () => {
    expect(resolvePlacesTypesFromRawSource({ category: 'meal takeaway' })).toEqual(['meal_takeaway']);
  });

  it('builds mapping input from candidate record', () => {
    const input = buildCategoryMappingInputFromCandidate({
      name: 'Braybrook Hotel',
      businessType: 'hotel',
      category: 'Other',
      rawSourceJson: { types: ['bar', 'pub', 'hotel'] },
      originalContent: {},
    });
    expect(input.placesTypes).toEqual(['bar', 'pub', 'hotel']);
    expect(input.businessName).toBe('Braybrook Hotel');
  });
});
