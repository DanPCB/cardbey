import { describe, it, expect } from 'vitest';
import {
  loadOriginalsManifest,
  resolveOriginalsSourcePath,
} from '../cardbeyOriginalsImport.js';
import { LIBRARY_ACCESS_MODE } from '../creatorLibraryProjection.js';
import { isKnownAssetType, ASSET_TYPE } from '../universalAssetTypes.js';
import { PEXELS_CURATED_QUERIES } from '../pexelsLibrarySync.js';
import { REAL_COLLECTION_DEFS } from '../realCollections.js';

describe('Phase 3B Universal Library', () => {
  it('originals manifest has 40+ unique checksums and required rights fields', () => {
    const manifest = loadOriginalsManifest();
    expect(manifest.items.length).toBeGreaterThanOrEqual(40);
    const checksums = new Set();
    for (const item of manifest.items) {
      expect(item.rightsRecordId).toBeTruthy();
      expect(item.sourceFile).toBeTruthy();
      expect(item.sourceChecksum).toBeTruthy();
      expect(checksums.has(item.sourceChecksum)).toBe(false);
      checksums.add(item.sourceChecksum);
      const resolved = resolveOriginalsSourcePath(item.sourceFile);
      expect(resolved.ok).toBe(true);
    }
  });

  it('supports icon and animation asset types', () => {
    expect(isKnownAssetType(ASSET_TYPE.ICON)).toBe(true);
    expect(isKnownAssetType(ASSET_TYPE.ANIMATION)).toBe(true);
  });

  it('creator access modes cover Phase 3B set', () => {
    expect(LIBRARY_ACCESS_MODE.FREE_TO_USE).toBe('FREE_TO_USE');
    expect(LIBRARY_ACCESS_MODE.PREMIUM_COMING_SOON).toBe('PREMIUM_COMING_SOON');
  });

  it('pexels curated queries stay bounded', () => {
    const total = PEXELS_CURATED_QUERIES.reduce((n, q) => n + (q.limit || 0), 0);
    expect(PEXELS_CURATED_QUERIES.length).toBeGreaterThanOrEqual(5);
    expect(total).toBeLessThanOrEqual(80);
  });

  it('defines at least five real collections', () => {
    expect(REAL_COLLECTION_DEFS.length).toBeGreaterThanOrEqual(5);
    expect(REAL_COLLECTION_DEFS.some((c) => c.slug === 'open-media-essentials')).toBe(true);
  });
});
