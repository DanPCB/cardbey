/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildGroundedCatalogFromResearch,
  catalogDiffersFromGenericScaffold,
  preferGroundedCatalog,
} from '../groundedCatalogPipeline.js';
import Mission001Flags from '../mission001Flags.js';

describe('Mission001 Gate 1 — grounded catalog pipeline', () => {
  const prevMaster = process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1;
  const prevGround = process.env.ENABLE_MISSION_001_GROUNDING_V1;

  beforeEach(() => {
    process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1 = '1';
    process.env.ENABLE_MISSION_001_GROUNDING_V1 = '1';
  });

  afterEach(() => {
    if (prevMaster === undefined) delete process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1;
    else process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1 = prevMaster;
    if (prevGround === undefined) delete process.env.ENABLE_MISSION_001_GROUNDING_V1;
    else process.env.ENABLE_MISSION_001_GROUNDING_V1 = prevGround;
  });

  it('returns null when grounding flag is off', () => {
    process.env.ENABLE_MISSION_001_GROUNDING_V1 = '0';
    expect(Mission001Flags.groundingConnected).toBe(false);
    const result = buildGroundedCatalogFromResearch(
      {
        researchRan: true,
        confidence: 0.9,
        extractedItems: [{ name: 'Wealth Management', price: 0, confidence: 0.9, sourceType: 'website' }],
      },
      { businessName: 'Anison Capital' },
      {},
    );
    expect(result).toBeNull();
  });

  it('produces evidence-grounded catalog distinct from generic scaffold names', () => {
    const research = {
      researchRan: true,
      confidence: 0.88,
      businessKind: 'services',
      facts: {
        businessName: { value: 'Studio Nine', sourceType: 'website', confidence: 0.9 },
      },
      extractedItems: [
        { name: 'Balayage Colour', price: 185, category: 'Colour', confidence: 0.92, sourceType: 'website' },
        { name: 'Signature Cut', price: 95, category: 'Haircuts', confidence: 0.9, sourceType: 'website' },
        { name: 'Blow Dry', price: 55, category: 'Styling', confidence: 0.88, sourceType: 'website' },
      ],
    };

    const grounded = buildGroundedCatalogFromResearch(research, { businessName: 'Studio Nine' }, {}, { missionId: 'm_gate1' });
    expect(grounded?.catalog?.products?.length).toBeGreaterThan(0);
    expect(grounded?.catalog?.meta?.catalogSource).toBe('source_grounded');
    expect(grounded?.grounded?.fidelity?.overall).toBeGreaterThan(50);

    const genericNames = ['Core Service', 'Premium Package', 'Basic Package', 'Express Service'];
    expect(catalogDiffersFromGenericScaffold(grounded.catalog, genericNames)).toBe(true);

    const templateCatalog = {
      products: [
        { name: 'Core Service' },
        { name: 'Premium Package' },
        { name: 'Basic Package' },
      ],
      meta: { catalogSource: 'template' },
    };
    const chosen = preferGroundedCatalog(grounded, templateCatalog);
    expect(chosen.meta.catalogSource).toBe('source_grounded');
    expect(chosen.products.some((p) => p.name === 'Balayage Colour')).toBe(true);
  });
});
