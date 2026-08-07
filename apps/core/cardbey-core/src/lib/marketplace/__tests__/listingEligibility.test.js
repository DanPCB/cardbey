import { describe, expect, it } from 'vitest';
import { evaluateMarketplaceListingEligibility } from '../listing/listingEligibility.js';

describe('marketplace listingEligibility', () => {
  it('accepts approved sellers with published video content', () => {
    const result = evaluateMarketplaceListingEligibility({
      sellerStatus: 'APPROVED',
      creatorId: 'creator-1',
      content: {
        id: 'content-1',
        creatorId: 'creator-1',
        type: 'VIDEO',
        status: 'published',
        thumbnail: '/thumb.png',
        mediaUrl: '/video.mp4',
      },
    });
    expect(result).toEqual({ eligible: true, reasons: [] });
  });

  it('returns explicit reasons for article content and seller approval gaps', () => {
    const result = evaluateMarketplaceListingEligibility({
      sellerStatus: 'PENDING',
      creatorId: 'creator-1',
      content: {
        id: 'content-1',
        creatorId: 'creator-1',
        type: 'ARTICLE',
        status: 'draft',
        thumbnail: null,
        mediaUrl: null,
      },
    });

    expect(result.eligible).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        'seller_not_approved',
        'content_type_not_supported',
        'source_not_published',
        'thumbnail_required',
        'media_required',
      ]),
    );
  });
});
