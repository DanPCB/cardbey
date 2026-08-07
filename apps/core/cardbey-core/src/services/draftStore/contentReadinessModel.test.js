import { describe, it, expect } from 'vitest';
import {
  applyContentReadinessToCatalog,
  buildContentReadinessModel,
  buildOwnerReviewSummary,
  createBusinessTruth,
  resolveHonestHero,
  resolveHonestItemImage,
  resolveHonestPriceDisplay,
  stampBusinessTruthOnItem,
} from './contentReadinessModel.js';
import { validateGroundedDraftForPublish } from './groundedPublishValidator.js';

describe('contentReadinessModel', () => {
  it('stamps Business Truth with source, confidence, review, media, publish eligibility', () => {
    const item = stampBusinessTruthOnItem(
      {
        id: '1',
        name: 'LED Signs',
        contentOrigin: 'sourced',
        catalogSource: 'research',
        needsOwnerReview: true,
        imageUrl: null,
      },
      { catalogSource: 'research' },
    );
    expect(item.businessTruth.source).toBe('research');
    expect(item.businessTruth.reviewStatus).toBe('pending');
    expect(item.businessTruth.mediaStatus).toBe('needs_media');
    expect(item.businessTruth.publishEligibility).toBe('allowed_after_approval');
    expect(item.businessTruth.confidence).toBeGreaterThan(0);
    expect(item.businessTruth.lastVerified).toBeTruthy();
  });

  it('honest presentation: missing image and price', () => {
    expect(resolveHonestItemImage({ name: 'X' }).label).toBe('Image required');
    expect(resolveHonestPriceDisplay({ contentOrigin: 'suggested', price: 49 }).kind).toBe(
      'price_on_request',
    );
    expect(resolveHonestHero({}).label).toBe('Hero image needed');
  });

  it('owner review summary counts confirmed / needs review / missing images', () => {
    const summary = buildOwnerReviewSummary({
      items: [
        {
          name: 'A',
          contentOrigin: 'sourced',
          needsOwnerReview: false,
          businessTruth: createBusinessTruth({
            source: 'research',
            confidence: 0.9,
            reviewStatus: 'approved',
            status: 'verified',
            mediaStatus: 'accepted',
          }),
          imageUrl: 'https://example.com/a.jpg',
        },
        {
          name: 'B',
          contentOrigin: 'sourced',
          needsOwnerReview: true,
          imageUrl: null,
        },
        {
          name: 'C',
          contentOrigin: 'suggested',
          needsOwnerReview: true,
          imageUrl: null,
        },
      ],
      meta: { heroMediaStatus: 'needs_media' },
    });
    expect(summary.totalServices).toBe(3);
    expect(summary.needsReview).toBe(2);
    expect(summary.suggested).toBe(1);
    expect(summary.imagesMissing).toBe(2);
    expect(summary.heroRequired).toBe(true);
    expect(summary.lines.some((l) => /Hero image required/i.test(l))).toBe(true);
  });

  it('buildContentReadinessModel marks suggested-only catalogue', () => {
    const model = buildContentReadinessModel({
      storeName: 'Galaxsigns',
      storeType: 'signage',
      items: [
        { name: 'Consultation', contentOrigin: 'suggested', needsOwnerReview: true },
        { name: 'Package', contentOrigin: 'suggested', needsOwnerReview: true },
      ],
    });
    expect(model.catalogue.state).toBe('suggested_only');
    expect(model.overall).toBe('needs_attention');
  });

  it('applyContentReadinessToCatalog attaches meta.contentReadiness', () => {
    const next = applyContentReadinessToCatalog({
      profile: { name: 'Galaxsigns', type: 'signage' },
      products: [{ id: '1', name: 'Channel Letters', contentOrigin: 'sourced', catalogSource: 'research' }],
      meta: { catalogSource: 'research' },
    });
    expect(next.products[0].businessTruth).toBeTruthy();
    expect(next.meta.contentReadiness.ownerReviewSummary.totalServices).toBe(1);
  });

  it('publish validator blocks unreviewed / suggested-only; warns on missing hero', () => {
    const blocked = validateGroundedDraftForPublish(
      {
        storeName: 'Galaxsigns',
        items: [
          { name: 'Gift idea', contentOrigin: 'suggested', needsOwnerReview: true },
        ],
      },
      { force: true },
    );
    expect(blocked.canPublish).toBe(false);
    expect(blocked.blockingIssues.some((i) => i.code === 'suggested_only_catalogue' || i.code === 'unreviewed_catalogue')).toBe(
      true,
    );

    const warned = validateGroundedDraftForPublish(
      {
        storeName: 'Galaxsigns',
        storeType: 'signage',
        items: [
          {
            name: 'LED',
            contentOrigin: 'sourced',
            needsOwnerReview: false,
            businessTruth: createBusinessTruth({
              source: 'research',
              confidence: 0.9,
              reviewStatus: 'approved',
              status: 'verified',
              mediaStatus: 'accepted',
              publishEligibility: 'eligible',
            }),
            imageUrl: 'https://example.com/x.jpg',
          },
        ],
        meta: { heroMediaStatus: 'needs_media' },
      },
      { force: true },
    );
    expect(warned.canPublish).toBe(true);
    expect(warned.warnings.some((i) => i.code === 'missing_hero')).toBe(true);
  });
});
