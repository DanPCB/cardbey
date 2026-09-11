/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  countCatalogItems,
  recoverEmptyStoreCatalog,
  resolveVerticalSlugFromDraftContext,
} from '../recoverEmptyStoreCatalog.js';
import {
  evaluateStoreDraftCriticalContent,
  readDraftPublishBlocked,
} from '../storeCreationBlackboard.js';

describe('Phase 2 store creation helpers', () => {
  it('countCatalogItems reads products or items', () => {
    expect(countCatalogItems({ products: [{ id: '1' }] })).toBe(1);
    expect(countCatalogItems({ items: [{ id: 'a' }, { id: 'b' }] })).toBe(2);
    expect(countCatalogItems({})).toBe(0);
  });

  it('resolveVerticalSlugFromDraftContext prefers explicit slug', () => {
    expect(
      resolveVerticalSlugFromDraftContext({
        input: { verticalSlug: 'food.vietnamese' },
        preview: {},
      }),
    ).toBe('food.vietnamese');
  });

  it('evaluateStoreDraftCriticalContent flags missing fields', () => {
    const empty = evaluateStoreDraftCriticalContent({});
    expect(empty.criticalOk).toBe(false);
    expect(empty.issues).toEqual(expect.arrayContaining(['products', 'tagline', 'description', 'hero']));

    const full = evaluateStoreDraftCriticalContent({
      items: [{ id: '1', name: 'Pho' }],
      tagline: 'Taste Saigon',
      description: 'Authentic Vietnamese coffee and pho in Melbourne.',
      heroImageUrl: 'https://example.com/hero.jpg',
      storeName: 'Pho Saigon',
    });
    expect(full.hasProducts).toBe(true);
    expect(full.hasTagline).toBe(true);
    expect(full.hasDescription).toBe(true);
    expect(full.hasHero).toBe(true);
    expect(full.criticalOk).toBe(true);
  });

  it('readDraftPublishBlocked reads input.metadataJson', () => {
    expect(readDraftPublishBlocked({ input: {} }).blocked).toBe(false);
    expect(
      readDraftPublishBlocked({
        input: { metadataJson: { publishBlocked: true, publishBlockedIssues: ['products'] } },
      }),
    ).toEqual({
      blocked: true,
      reason: null,
      issues: ['products'],
    });
  });

  it('recoverEmptyStoreCatalog skips sparse_honest', async () => {
    const catalog = { meta: { catalogSource: 'sparse_honest' }, products: [] };
    const out = await recoverEmptyStoreCatalog({ catalog, params: {}, input: {} });
    expect(out.recovered).toBe(false);
    expect(out.itemCount).toBe(0);
  });
});
