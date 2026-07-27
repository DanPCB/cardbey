import { describe, it, expect } from 'vitest';
import { dedupeCatalogProductsByName } from '../../lib/persistence/catalogDedupe.js';

describe('buildCatalog duplicate guard', () => {
  it('simulates old AI expansion bug would produce 30 unique max from 10 variations', () => {
    const variations = Array.from({ length: 10 }, (_, i) => ({ name: `Item ${i}` }));
    const products = Array.from({ length: 20 }, (_, i) => ({ name: `AI Product ${i}` }));
    const need = 4;
    const seen = new Set(products.map((p) => p.name.toLowerCase()));
    for (let added = 0, guard = 0; added < need && guard < 100; guard++) {
      const v = variations[guard % variations.length];
      const key = v.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      products.push({ name: v.name });
      added += 1;
    }
    expect(products).toHaveLength(24);
    const { products: deduped, removedCount } = dedupeCatalogProductsByName(products);
    expect(removedCount).toBe(0);
    expect(deduped).toHaveLength(24);
  });
});
