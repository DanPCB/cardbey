/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { attachNormalizedProvenanceToCatalog, PROVENANCE_STATUS } from '../provenanceNormalize.js';

describe('Mission001 Gate 4 — provenance normalization', () => {
  it('marks sourced items REAL and template items GENERATED', () => {
    const catalog = attachNormalizedProvenanceToCatalog({
      meta: { catalogSource: 'research' },
      products: [
        { name: 'Balayage', contentOrigin: 'sourced', confidence: 0.9 },
        { name: 'Core Service', contentOrigin: 'category_fallback', aiGenerated: true },
      ],
    });
    expect(catalog.products[0].provenanceStatus).toBe(PROVENANCE_STATUS.REAL);
    expect(catalog.products[1].provenanceStatus).toBe(PROVENANCE_STATUS.GENERATED);
    expect(catalog.products[0].provenance?.status).toBe(PROVENANCE_STATUS.REAL);
  });
});
