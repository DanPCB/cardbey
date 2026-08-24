import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  attachCatalogGrounding,
  resolveCatalogAuthorityDecision,
  CATALOG_FALLBACK_REASONS,
} from '../catalogAuthorityDecision.js';

describe('resolveCatalogAuthorityDecision', () => {
  const prevStage = process.env.PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW;
  const prevPipe = process.env.ENABLE_STORE_RESEARCH_PIPELINE;

  beforeEach(() => {
    process.env.ENABLE_STORE_RESEARCH_PIPELINE = '1';
    process.env.PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW = '1';
  });

  afterEach(() => {
    if (prevStage === undefined) delete process.env.PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW;
    else process.env.PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW = prevStage;
    if (prevPipe === undefined) delete process.env.ENABLE_STORE_RESEARCH_PIPELINE;
    else process.env.ENABLE_STORE_RESEARCH_PIPELINE = prevPipe;
  });

  it('selects sourced_pending_review when staging enabled', () => {
    const decision = resolveCatalogAuthorityDecision({
      params: { businessName: 'Modern Security Doors', missionId: 'm1' },
      input: { websiteUrl: 'https://example.com' },
      researchAttempted: true,
      research: {
        researchRan: true,
        fallbackToGenerated: false,
        ownerReviewRequired: true,
        ownerConfirmed: false,
        extractedItems: [{ name: 'Roller Shutters' }],
      },
    });
    expect(decision.selectedAuthority).toBe('sourced_pending_review');
    expect(decision.fallbackReason).toBeNull();
  });

  it('labels OWNER_REVIEW_STAGING_DISABLED when pending items cannot stage', () => {
    process.env.PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW = '0';
    const decision = resolveCatalogAuthorityDecision({
      params: { businessName: 'Modern Security Doors', missionId: 'm1' },
      input: { websiteUrl: 'https://example.com' },
      researchAttempted: true,
      research: {
        researchRan: true,
        fallbackToGenerated: false,
        ownerReviewRequired: true,
        ownerConfirmed: false,
        extractedItems: [{ name: 'Roller Shutters' }],
      },
    });
    expect(decision.selectedAuthority).toBe('suggested_fallback');
    expect(decision.fallbackReason).toBe(CATALOG_FALLBACK_REASONS.OWNER_REVIEW_STAGING_DISABLED);
  });

  it('uses WEBSITE_NOT_FOUND when Places matched but no official website resolved', () => {
    const decision = resolveCatalogAuthorityDecision({
      params: { businessName: 'Modern Security Doors', location: 'Melbourne', missionId: 'm1' },
      input: {},
      researchAttempted: true,
      research: {
        researchRan: true,
        fallbackToGenerated: true,
        ownerReviewRequired: true,
        confidence: 0.77,
        sourcesUsed: [{ sourceType: 'google_business', sourceUrl: 'https://maps.google.com' }],
        extractedItems: [],
      },
    });
    expect(decision.selectedAuthority).toBe('suggested_fallback');
    expect(decision.fallbackReason).toBe(CATALOG_FALLBACK_REASONS.WEBSITE_NOT_FOUND);
  });

  it('uses NO_CATALOG_CONTENT_FOUND when website resolved but empty extract', () => {
    const decision = resolveCatalogAuthorityDecision({
      params: { businessName: 'Modern Security Doors', missionId: 'm1' },
      input: { websiteUrl: 'https://modernsecuritydoors.example' },
      researchAttempted: true,
      research: {
        researchRan: true,
        fallbackToGenerated: true,
        ownerReviewRequired: true,
        confidence: 0.8,
        sourcesUsed: [
          { sourceType: 'official_website', sourceUrl: 'https://modernsecuritydoors.example' },
        ],
        extractedItems: [],
      },
    });
    expect(decision.selectedAuthority).toBe('suggested_fallback');
    expect(decision.fallbackReason).toBe(CATALOG_FALLBACK_REASONS.NO_CATALOG_CONTENT_FOUND);
  });

  it('resolves official website from nested SourceMatchResult shape', () => {
    const decision = resolveCatalogAuthorityDecision({
      params: { businessName: 'Modern Security Doors', location: 'Ravenhall VIC', missionId: 'm1' },
      input: {},
      researchAttempted: true,
      research: {
        researchRan: true,
        fallbackToGenerated: true,
        ownerReviewRequired: true,
        confidence: 0.77,
        sourcesUsed: [
          {
            matched: true,
            source: {
              sourceType: 'official_website',
              sourceUrl: 'http://modernsecuritydoors.com.au',
              raw: { website: 'http://modernsecuritydoors.com.au' },
            },
          },
        ],
        extractedItems: [],
      },
    });
    expect(decision.websiteResolved).toBe(true);
    expect(decision.fallbackReason).toBe(CATALOG_FALLBACK_REASONS.NO_CATALOG_CONTENT_FOUND);
  });

  it('resolves website from Place Details on a google_business match', () => {
    const decision = resolveCatalogAuthorityDecision({
      params: { businessName: 'Modern Security Doors', location: 'Ravenhall VIC', missionId: 'm1' },
      input: {},
      researchAttempted: true,
      research: {
        researchRan: true,
        fallbackToGenerated: true,
        sourcesUsed: [
          {
            matched: true,
            source: {
              sourceType: 'google_business',
              sourceUrl: 'https://maps.google.com/?cid=1',
              raw: { website: 'http://modernsecuritydoors.com.au' },
            },
          },
        ],
        extractedItems: [],
      },
    });
    expect(decision.websiteResolved).toBe(true);
    expect(decision.fallbackReason).toBe(CATALOG_FALLBACK_REASONS.NO_CATALOG_CONTENT_FOUND);
  });

  it('attaches grounding summary for suggested catalogues', () => {
    const grounded = attachCatalogGrounding(
      {
        products: [
          { name: 'A', contentOrigin: 'suggested' },
          { name: 'B', contentOrigin: 'suggested' },
        ],
        meta: {},
      },
      {
        selectedAuthority: 'suggested_fallback',
        fallbackReason: CATALOG_FALLBACK_REASONS.NO_CATALOG_CONTENT_FOUND,
        ownerReviewRequired: true,
      },
    );
    expect(grounded.meta.catalogGrounding).toMatchObject({
      sourcedCount: 0,
      suggestedCount: 2,
      authority: 'suggested',
      fallbackReason: CATALOG_FALLBACK_REASONS.NO_CATALOG_CONTENT_FOUND,
    });
  });
});
