/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildSparseHonestCatalog,
  shouldUseSparseCatalogMode,
  stripFabricatedCatalogScaffolds,
} from '../sparseCatalogMode.js';

describe('Mission001 Gate 3 — sparse honest mode', () => {
  const prevMaster = process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1;
  const prevSparse = process.env.ENABLE_MISSION_001_SPARSE_MODE_V1;

  beforeEach(() => {
    process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1 = '1';
    process.env.ENABLE_MISSION_001_SPARSE_MODE_V1 = '1';
  });

  afterEach(() => {
    if (prevMaster === undefined) delete process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1;
    else process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1 = prevMaster;
    if (prevSparse === undefined) delete process.env.ENABLE_MISSION_001_SPARSE_MODE_V1;
    else process.env.ENABLE_MISSION_001_SPARSE_MODE_V1 = prevSparse;
  });

  it('builds empty honest catalog without fabricated offerings', () => {
    const catalog = buildSparseHonestCatalog({ businessName: 'Anison Capital' }, {}, { sparseMode: true });
    expect(catalog.products).toEqual([]);
    expect(catalog.meta.mission001SparseMode).toBe(true);
    expect(catalog.meta.catalogSource).toBe('sparse_honest');
  });

  it('prefers sparse mode for unresolved name-only intake', () => {
    expect(shouldUseSparseCatalogMode({ sparseMode: true }, null)).toBe(true);
    expect(
      shouldUseSparseCatalogMode(
        {},
        { researchRan: true, extractedItems: [{ name: 'Real Service', confidence: 0.9 }] },
      ),
    ).toBe(false);
  });

  it('forces sparse mode for matched real business with no verified catalog even when flag is off', () => {
    // Simulates "Banh Mi Ngon" canary: SOURCE_MATCHED ~0.60, SERVICE_CATALOG_EXTRACTED=0,
    // fallbackToGenerated=true, sourcesUsed populated.
    delete process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1;
    delete process.env.ENABLE_MISSION_001_SPARSE_MODE_V1;

    const research = {
      researchRan: true,
      fallbackToGenerated: true,
      confidence: 0.6,
      sourcesUsed: [{ sourceType: 'google_business', confidence: 0.75 }],
      extractedItems: [],
      catalog: null,
    };
    expect(shouldUseSparseCatalogMode({}, research)).toBe(true);
  });

  it('allows template generation when no sources were found (unknown business)', () => {
    delete process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1;
    delete process.env.ENABLE_MISSION_001_SPARSE_MODE_V1;

    const research = {
      researchRan: true,
      fallbackToGenerated: true,
      confidence: 0,
      sourcesUsed: [],
      extractedItems: [],
      catalog: null,
    };
    expect(shouldUseSparseCatalogMode({}, research)).toBe(false);
  });

  it('strips generic scaffold products while keeping sourced items', () => {
    const catalog = stripFabricatedCatalogScaffolds({
      products: [
        { name: 'Core Service', contentOrigin: 'category_fallback' },
        { name: 'Wealth Review', contentOrigin: 'sourced', confidence: 0.9 },
      ],
    });
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0].name).toBe('Wealth Review');
  });
});
