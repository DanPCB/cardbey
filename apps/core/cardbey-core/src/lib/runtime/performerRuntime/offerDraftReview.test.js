import { describe, expect, it } from 'vitest';
import {
  canPublishOfferDraftStatus,
  isPublishOfferBlockedByReview,
  pickLatestOfferDraftStatusFromRecords,
} from './offerDraftReview.js';

describe('offerDraftReview (core)', () => {
  it('canPublishOfferDraftStatus only when approved', () => {
    expect(canPublishOfferDraftStatus('approved')).toBe(true);
    expect(canPublishOfferDraftStatus('review_required')).toBe(false);
  });

  it('isPublishOfferBlockedByReview mirrors approval gate', () => {
    expect(isPublishOfferBlockedByReview('review_required')).toBe(true);
    expect(isPublishOfferBlockedByReview('approved')).toBe(false);
  });

  it('pickLatestOfferDraftStatusFromRecords uses highest versionNumber', () => {
    const status = pickLatestOfferDraftStatusFromRecords([
      {
        capabilityId: 'create_offer_draft',
        updatedAt: 1,
        offerDraft: { status: 'approved', versionNumber: 1 },
      },
      {
        capabilityId: 'revise_offer_draft',
        updatedAt: 2,
        offerDraft: { status: 'review_required', versionNumber: 2 },
      },
    ]);
    expect(status).toBe('review_required');
  });

  it('publish blocked when v1 approved but v2 pending review', () => {
    const status = pickLatestOfferDraftStatusFromRecords([
      {
        capabilityId: 'create_offer_draft',
        offerDraft: { status: 'approved', versionNumber: 1 },
      },
      {
        capabilityId: 'revise_offer_draft',
        offerDraft: { status: 'review_required', versionNumber: 2 },
      },
    ]);
    expect(isPublishOfferBlockedByReview(status)).toBe(true);
  });
});
