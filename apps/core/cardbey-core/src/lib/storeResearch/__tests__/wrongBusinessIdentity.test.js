/**
 * @vitest-environment node
 * Wrong-business / identity-collision regressions for Mission 001 resolution.
 */
import { describe, expect, it } from 'vitest';
import {
  distinctiveNameTokenOverlap,
  classifyBusinessResolution,
  BUSINESS_RESOLUTION_OUTCOME,
} from '../../mission001/businessResolutionOutcomes.js';
import { sharedBrandWebsiteFromCandidates } from '../businessEntityResolver.js';

describe('wrong-business identity protection', () => {
  it('does not treat same short brand in different cities as identity', () => {
    // "AWE Financial" Melbourne vs "AWE Finance" Sydney — weak single-token brand
    const hit = distinctiveNameTokenOverlap('AWE Financial', 'AWE Finance Sydney');
    expect(hit.strong).toBe(false);
  });

  it('flags multi-token Phuong Nam collisions as strong overlap (must stay ambiguous)', () => {
    const a = distinctiveNameTokenOverlap(
      'Phuong Nam Export Trading',
      'CÔNG TY TNHH XUẤT NHẬP KHẨU PHƯƠNG NAM SÀI GÒN',
    );
    const b = distinctiveNameTokenOverlap(
      'Phuong Nam Export Trading',
      'Nam Phuong Trading - Import & Export Co.,Ltd',
    );
    expect(a.strong).toBe(true);
    expect(b.strong).toBe(true);
    // Classifier: multiple candidates without shared brand → ambiguous / unresolved catalog
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

  it('rejects Flower Store / Spotless generic collisions', () => {
    expect(distinctiveNameTokenOverlap('Flower Store', 'H Flowers').strong).toBe(false);
    expect(
      distinctiveNameTokenOverlap('Spotless Cleaning Services', 'Simply Spotless Melbourne').strong,
    ).toBe(false);
    expect(distinctiveNameTokenOverlap('Anison Capital', 'Aniston Lawyers').strong).toBe(false);
    expect(distinctiveNameTokenOverlap('CA Handy Man', 'Handyman In Melbourne').strong).toBe(false);
  });

  it('does not invent shared brand website across unrelated hosts', () => {
    expect(
      sharedBrandWebsiteFromCandidates([
        { website: 'https://handymaninmelbourne.au' },
        { website: 'https://cales.com.au' },
      ]),
    ).toBeNull();
  });

  it('keeps catalog ineligible when website missing and identity unresolved', () => {
    const r = classifyBusinessResolution({
      websiteFound: false,
      productCount: 0,
      entityCandidates: 0,
      sourcesUsed: [{ sourceType: 'manual' }],
    });
    expect(r.identityResolved).toBe(false);
    expect(r.catalogEligible).toBe(false);
    expect(r.outcome).toBe(BUSINESS_RESOLUTION_OUTCOME.BUSINESS_UNRESOLVED);
  });

  it('never marks catalog eligible for wrong-entity guard', () => {
    const r = classifyBusinessResolution({
      wrongEntity: true,
      websiteFound: true,
      productCount: 12,
    });
    expect(r.outcome).toBe(BUSINESS_RESOLUTION_OUTCOME.WEBSITE_IDENTITY_MISMATCH);
    expect(r.catalogEligible).toBe(false);
  });
});
