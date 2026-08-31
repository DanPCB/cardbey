/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  classifyBusinessResolution,
  distinctiveNameTokenOverlap,
  computeMission001ResolutionMetrics,
  BUSINESS_RESOLUTION_OUTCOME,
  parseLocationParts,
} from '../businessResolutionOutcomes.js';

describe('businessResolutionOutcomes', () => {
  it('parses AU location parts', () => {
    const p = parseLocationParts('Ravenhall VIC 3023');
    expect(p.state).toBe('VIC');
    expect(p.postcode).toBe('3023');
  });

  it('prefers UNRESOLVED over weak name-only location input', () => {
    const r = classifyBusinessResolution({
      websiteFound: false,
      productCount: 0,
      entityCandidates: 0,
      sourcesUsed: [{ sourceType: 'manual' }],
    });
    expect(r.outcome).toBe(BUSINESS_RESOLUTION_OUTCOME.BUSINESS_UNRESOLVED);
    expect(r.identityResolved).toBe(false);
    expect(r.catalogEligible).toBe(false);
  });

  it('marks catalog found when website + offerings exist', () => {
    const r = classifyBusinessResolution({
      websiteFound: true,
      productCount: 12,
      ownerWebsite: 'https://example.com',
      researchConfidence: 0.9,
      sourcesUsed: [{ sourceType: 'official_website' }],
    });
    expect(r.outcome).toBe(BUSINESS_RESOLUTION_OUTCOME.CATALOG_FOUND);
    expect(r.identityResolved).toBe(true);
    expect(r.catalogEligible).toBe(true);
  });

  it('keeps ambiguous multi-entity without shared website unresolved for catalog', () => {
    const r = classifyBusinessResolution({
      pipelineMode: 'ambiguous_entity',
      entityCandidates: 4,
      requiresOwnerConfirmation: true,
      websiteFound: false,
      productCount: 0,
    });
    expect(r.outcome).toBe(BUSINESS_RESOLUTION_OUTCOME.IDENTITY_AMBIGUOUS);
    expect(r.catalogEligible).toBe(false);
  });

  it('rejects generic single-token name collisions (Flower Store / Spotless)', () => {
    expect(distinctiveNameTokenOverlap('Flower Store', 'H Flowers').strong).toBe(false);
    expect(distinctiveNameTokenOverlap('Spotless Cleaning Services', 'Simply Spotless Melbourne').strong).toBe(
      false,
    );
    expect(distinctiveNameTokenOverlap('Anison Capital', 'Aniston Lawyers').strong).toBe(false);
  });

  it('detects multi-token Phuong Nam overlap but collision remains a ranking concern', () => {
    const hit = distinctiveNameTokenOverlap(
      'Phuong Nam Export Trading',
      'CÔNG TY TNHH XUẤT NHẬP KHẨU PHƯƠNG NAM SÀI GÒN',
    );
    expect(hit.shared).toEqual(expect.arrayContaining(['phuong', 'nam']));
    expect(hit.strong).toBe(true);
  });

  it('computes separated A–E metrics without inventing eligibility', () => {
    const metrics = computeMission001ResolutionMetrics([
      {
        identityResolved: true,
        catalogEligible: true,
        productCount: 10,
        falseOfferingCount: 0,
        resolutionOutcome: BUSINESS_RESOLUTION_OUTCOME.CATALOG_FOUND,
        offeringsPubliclyExpected: true,
      },
      {
        identityResolved: false,
        catalogEligible: false,
        productCount: 0,
        falseOfferingCount: 0,
        resolutionOutcome: BUSINESS_RESOLUTION_OUTCOME.BUSINESS_UNRESOLVED,
        offeringsPubliclyExpected: true,
      },
    ]);
    expect(metrics.businessResolutionRatePct).toBe(50);
    expect(metrics.eligibleOfferingReconstructionRatePct).toBe(100);
    expect(metrics.endToEndOfferingCoveragePct).toBe(50);
    expect(metrics.falseOfferingRatePct).toBe(0);
  });
});
