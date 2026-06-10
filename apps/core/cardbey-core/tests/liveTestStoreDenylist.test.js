import { describe, expect, it } from 'vitest';
import { isRetiredLiveTestStore, LIVE_RETIRED_TEST_STORE_SLUGS } from '../src/utils/liveTestStoreDenylist.js';
import {
  filterOwnerVisibleStores,
  isPublicFeedEligibleBusiness,
} from '../src/utils/publicStoreVisibility.js';

describe('liveTestStoreDenylist', () => {
  it('flags known live test slugs', () => {
    expect(isRetiredLiveTestStore({ slug: 'my-cafe' })).toBe(true);
    expect(isRetiredLiveTestStore({ slug: 'abc-fashion' })).toBe(true);
    expect(isRetiredLiveTestStore({ slug: 'real-bakery' })).toBe(false);
    expect(LIVE_RETIRED_TEST_STORE_SLUGS.size).toBeGreaterThanOrEqual(7);
  });

  it('excludes retired stores from public feed and owner lists', () => {
    const retired = { slug: 'my-business', isActive: true, publishedAt: new Date(), userId: 'user-1' };
    const live = { slug: 'real-shop', isActive: true, publishedAt: new Date(), userId: 'user-1' };
    expect(isPublicFeedEligibleBusiness(retired)).toBe(false);
    expect(isPublicFeedEligibleBusiness(live)).toBe(true);
    expect(filterOwnerVisibleStores([retired, live])).toEqual([live]);
  });
});
