/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  classifyMission001Failure,
  summarizeFailureTaxonomy,
  computeOfferingReconstructionRate,
  computeFalseOfferingRate,
  summarizeByVertical,
} from '../failureTaxonomy.js';

describe('Mission001 failure taxonomy', () => {
  it('classifies website identity with zero catalog', () => {
    expect(
      classifyMission001Failure({
        identityResolved: true,
        websiteFound: true,
        productCount: 0,
        evidenceQuality: 'strong',
        inputType: 'website',
      }),
    ).toBe('WEBSITE_FOUND_NO_CATALOG');
  });

  it('classifies structured catalog success', () => {
    expect(
      classifyMission001Failure({
        identityResolved: true,
        productCount: 120,
        sourcesUsed: [{ sourceType: 'booking_platform' }],
      }),
    ).toBe('STRUCTURED_CATALOG_FOUND');
  });

  it('classifies weak name-only as sparse correctly', () => {
    expect(
      classifyMission001Failure({
        identityResolved: false,
        productCount: 0,
        sparseMode: true,
        inputType: 'name_only',
        evidenceQuality: 'weak',
      }),
    ).toBe('SPARSE_CORRECTLY');
  });

  it('summarizes taxonomy percentages and offering rates', () => {
    const rows = [
      {
        failureClass: 'WEBSITE_FOUND_NO_CATALOG',
        identityResolved: true,
        offeringsPubliclyExpected: true,
        productCount: 0,
        falseOfferingCount: 0,
        vertical: 'retail',
        fidelityScore: 55,
      },
      {
        failureClass: 'STRUCTURED_CATALOG_FOUND',
        identityResolved: true,
        offeringsPubliclyExpected: true,
        productCount: 10,
        falseOfferingCount: 0,
        vertical: 'beauty',
        fidelityScore: 80,
      },
      {
        failureClass: 'SPARSE_CORRECTLY',
        identityResolved: false,
        offeringsPubliclyExpected: false,
        productCount: 0,
        falseOfferingCount: 0,
        vertical: 'beauty',
        fidelityScore: 55,
      },
    ];
    const tax = summarizeFailureTaxonomy(rows);
    expect(tax.pct.WEBSITE_FOUND_NO_CATALOG).toBeCloseTo(33.3, 0);
    expect(computeOfferingReconstructionRate(rows).ratePct).toBe(50);
    expect(computeFalseOfferingRate(rows).ratePct).toBe(0);
    const verticals = summarizeByVertical(rows);
    expect(verticals.find((v) => v.vertical === 'beauty')?.offeringReconstructionPct).toBe(100);
  });
});
