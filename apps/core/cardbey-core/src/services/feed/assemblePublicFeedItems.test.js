import { describe, expect, it } from 'vitest';
import {
  assemblePublicFeedItems,
  publicStoreResultToFeedItem,
} from './assemblePublicFeedItems.js';

describe('assemblePublicFeedItems', () => {
  it('allows only one organic item per storeId', () => {
    const items = assemblePublicFeedItems([
      { id: 'organic:a', storeId: 'a', placementType: 'organic', store: { id: 'a', name: 'A' } },
      { id: 'organic:a-copy', storeId: 'a', placementType: 'organic', store: { id: 'a', name: 'A' } },
      { id: 'organic:b', storeId: 'b', placementType: 'organic', store: { id: 'b', name: 'B' } },
    ]);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.storeId)).toEqual(['a', 'b']);
  });

  it('allows organic + sponsored for same storeId', () => {
    const items = assemblePublicFeedItems([
      { id: 'organic:a', storeId: 'a', placementType: 'organic', store: { id: 'a' } },
      { id: 'sponsored:a', storeId: 'a', placementType: 'sponsored', store: { id: 'a' } },
    ]);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.placementType)).toEqual(['organic', 'sponsored']);
  });

  it('preview placement is not collapsed against organic (preload must not block organic)', () => {
    const items = assemblePublicFeedItems([
      { id: 'organic:a', storeId: 'a', placementType: 'organic', store: { id: 'a' } },
      { id: 'preview:a', storeId: 'a', placementType: 'preview', store: { id: 'a' } },
    ]);
    expect(items.filter((i) => i.placementType === 'organic')).toHaveLength(1);
    expect(items.filter((i) => i.placementType === 'preview')).toHaveLength(1);
  });

  it('merge dedupes when same store appears in recent and featured candidate lists', () => {
    const recent = publicStoreResultToFeedItem(
      { store: { id: 's1', name: 'BrayB', slug: 'brayb-bakery' } },
      { source: 'recent', rank: 0 },
    );
    const featured = publicStoreResultToFeedItem(
      { store: { id: 's1', name: 'BrayB', slug: 'brayb-bakery' } },
      { source: 'featured', rank: 1 },
    );
    const merged = assemblePublicFeedItems([recent, featured]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.source).toBe('recent');
  });
});

describe('publicStoreResultToFeedItem', () => {
  it('maps resolver row to feed item with organic placement', () => {
    const item = publicStoreResultToFeedItem(
      { store: { id: 'biz-1', name: 'Test', slug: 'test' } },
      { source: 'public_stores_feed', rank: 3 },
    );
    expect(item).toMatchObject({
      id: 'organic:biz-1',
      storeId: 'biz-1',
      placementType: 'organic',
      source: 'public_stores_feed',
      rank: 3,
    });
  });
});
