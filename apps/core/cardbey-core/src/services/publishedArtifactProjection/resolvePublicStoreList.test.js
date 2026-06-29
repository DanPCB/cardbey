import { describe, expect, it } from 'vitest';
import {
  dedupeExactStoreIdPublicStoreResults,
  dedupeNearDuplicatePublicStoreResults,
} from './resolvePublicStoreList.js';

describe('dedupeExactStoreIdPublicStoreResults', () => {
  it('keeps only one row per store.id', () => {
    const store = { id: 's1', name: 'BrayB', slug: 'brayb-bakery' };
    const rows = dedupeExactStoreIdPublicStoreResults([
      { store },
      { store: { ...store } },
      { store: { id: 's2', name: 'Other', slug: 'other' } },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.store.id)).toEqual(['s1', 's2']);
  });
});

describe('resolvePublicStoreList organic dedupe', () => {
  it('near-dedupe runs after exact store id dedupe', () => {
    const rows = dedupeNearDuplicatePublicStoreResults(
      dedupeExactStoreIdPublicStoreResults([
        { store: { id: 'a1', name: 'AA Travel and Golf', slug: 'aa-travel-and-golf-tour' } },
        { store: { id: 'a2', name: 'AA Travel & Golf', slug: 'aa-travel-golf-tour' } },
      ]),
    );
    expect(rows).toHaveLength(1);
  });
});
