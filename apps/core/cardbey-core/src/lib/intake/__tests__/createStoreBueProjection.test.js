import { describe, it, expect } from 'vitest';
import { projectCreateStoreFieldsFromBue } from '../createStoreBueProjection.js';

describe('projectCreateStoreFieldsFromBue', () => {
  it('projects brandName and confidence from governed values', () => {
    const projected = projectCreateStoreFieldsFromBue({
      artifact: {
        artifactType: 'business_card',
        classification: { confidence: 0.9, artifactType: 'business_card' },
      },
      brand: {
        brandName: { value: 'PTH International Furniture', confidence: 0.85, source: 'OBSERVED' },
      },
    });
    expect(projected).toBeTruthy();
    expect(projected.businessName).toBe('PTH International Furniture');
    expect(projected.location).toBe('');
    expect(projected.category).toBe('');
    expect(projected.confidence).toBeGreaterThanOrEqual(85);
  });

  it('returns null for empty bundle', () => {
    expect(projectCreateStoreFieldsFromBue(null)).toBeNull();
    expect(projectCreateStoreFieldsFromBue({})).toBeNull();
  });
});
