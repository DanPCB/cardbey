import { describe, expect, it } from 'vitest';
import { classifyCatalogItem } from '../../src/lib/admin/storeContentManagementService.js';

describe('storeContentManagementService', () => {
  it('classifies service-like categories', () => {
    expect(classifyCatalogItem({ category: 'Services' })).toBe('service');
    expect(classifyCatalogItem({ category: 'Head Spa Treatment' })).toBe('service');
    expect(classifyCatalogItem({ category: 'Coffee' })).toBe('product');
  });
});
