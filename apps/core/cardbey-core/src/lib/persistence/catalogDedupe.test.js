import { describe, it, expect } from 'vitest';
import { dedupeCatalogProductsByName, dedupeRowsBeforeInsert } from './catalogDedupe.js';

describe('catalogDedupe', () => {
  it('dedupeCatalogProductsByName keeps first occurrence', () => {
    const products = [
      { name: 'House Special' },
      { name: 'Latte' },
      { name: 'house special' },
    ];
    const { products: kept, removedCount } = dedupeCatalogProductsByName(products, { logContext: 'test' });
    expect(kept).toHaveLength(2);
    expect(removedCount).toBe(1);
  });

  it('dedupeRowsBeforeInsert removes duplicate insert rows', () => {
    const { rows, removedCount } = dedupeRowsBeforeInsert([
      { id: '1', name: 'Tea' },
      { id: '2', name: 'tea' },
    ]);
    expect(rows).toHaveLength(1);
    expect(removedCount).toBe(1);
  });
});
