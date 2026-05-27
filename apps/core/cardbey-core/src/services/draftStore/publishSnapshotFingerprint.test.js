import { describe, it, expect } from 'vitest';
import { buildCatalogFingerprint, buildSourceFingerprintFromCatalog } from './publishSnapshotFingerprint.js';

describe('publishSnapshotFingerprint', () => {
  it('builds stable hash for same catalog', () => {
    const items = [
      { name: 'Bún Cá', price: 19, category: 'Noodles' },
      { name: 'Bánh cuốn', price: 17, categoryId: 'mains' },
    ];
    const a = buildSourceFingerprintFromCatalog(items);
    const b = buildSourceFingerprintFromCatalog([...items]);
    expect(a).toBe(b);
    expect(buildCatalogFingerprint(items).count).toBe(2);
  });

  it('changes hash when catalog changes', () => {
    const a = buildSourceFingerprintFromCatalog([{ name: 'A', price: 1 }]);
    const b = buildSourceFingerprintFromCatalog([{ name: 'B', price: 1 }]);
    expect(a).not.toBe(b);
  });
});
