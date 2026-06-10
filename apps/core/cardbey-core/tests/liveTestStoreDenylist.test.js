import { describe, expect, it } from 'vitest';
import { isRetiredLiveTestStore, LIVE_RETIRED_TEST_STORE_SLUGS } from '../src/utils/liveTestStoreDenylist.js';
import {
  filterOwnerVisibleStores,
  isPublicFeedEligibleBusiness,
} from '../src/utils/publicStoreVisibility.js';

describe('liveTestStoreDenylist', () => {
  it('flags orphan demo slugs only', () => {
    expect(isRetiredLiveTestStore({ slug: 'my-cafe' })).toBe(true);
    expect(isRetiredLiveTestStore({ slug: 'shop-cafe' })).toBe(true);
    expect(isRetiredLiveTestStore({ slug: 'my-business' })).toBe(true);
    expect(isRetiredLiveTestStore({ slug: 'abc-fashion' })).toBe(false);
    expect(isRetiredLiveTestStore({ slug: 'aa-travel-golf-tour' })).toBe(false);
    expect(LIVE_RETIRED_TEST_STORE_SLUGS.size).toBe(4);
  });

  it('excludes retired stores from public feed and owner lists', () => {
    const retired = { slug: 'my-business', isActive: true, publishedAt: new Date(), userId: 'user-1' };
    const live = { slug: 'real-shop', isActive: true, publishedAt: new Date(), userId: 'user-1' };
    expect(isPublicFeedEligibleBusiness(retired)).toBe(false);
    expect(isPublicFeedEligibleBusiness(live)).toBe(true);
    expect(filterOwnerVisibleStores([retired, live])).toEqual([live]);
  });
});
