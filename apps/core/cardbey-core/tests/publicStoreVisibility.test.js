import { describe, expect, it } from 'vitest';
import {
  isAbandonedGuestOwnedBusiness,
  isPublicFeedEligibleBusiness,
} from '../src/utils/publicStoreVisibility.js';

describe('publicStoreVisibility', () => {
  it('flags guest-owned businesses as abandoned', () => {
    expect(
      isAbandonedGuestOwnedBusiness({
        userId: 'guest_abc123',
        isActive: true,
        publishedAt: new Date(),
      }),
    ).toBe(true);
  });

  it('flags expired guest draft businesses', () => {
    expect(
      isAbandonedGuestOwnedBusiness({
        userId: 'user-real',
        isGuestDraft: true,
        expiresAt: new Date(Date.now() - 1000),
      }),
    ).toBe(true);
  });

  it('excludes abandoned guest stores from public feed eligibility', () => {
    expect(
      isPublicFeedEligibleBusiness({
        userId: 'guest_session_1',
        isActive: true,
        publishedAt: new Date(),
      }),
    ).toBe(false);
  });

  it('keeps owned published stores eligible', () => {
    expect(
      isPublicFeedEligibleBusiness({
        userId: 'user-real',
        isActive: true,
        publishedAt: new Date(),
      }),
    ).toBe(true);
  });
});
