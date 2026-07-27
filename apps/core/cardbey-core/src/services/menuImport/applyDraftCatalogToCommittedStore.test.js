import { describe, expect, it } from 'vitest';
import { filterCatalogApplyItems } from './applyDraftCatalogToCommittedStore.js';

describe('filterCatalogApplyItems', () => {
  it('drops section-header rows that match category with no price', () => {
    const out = filterCatalogApplyItems([
      { name: 'Massage', category: 'Massage', price: null },
      { name: 'Eyebrow', category: 'Waxing', price: 15 },
      { name: 'Refresh', category: 'Spa Packages', price: 69, inclusions: ['Head massage'] },
    ]);
    expect(out.map((i) => i.name)).toEqual(['Eyebrow', 'Refresh']);
  });

  it('keeps a named service even without price when it has description', () => {
    const out = filterCatalogApplyItems([
      { name: 'Consultation', category: 'Services', price: null, description: 'By appointment' },
    ]);
    expect(out).toHaveLength(1);
  });
});
