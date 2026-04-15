/**
 * Unit tests for draftQaAgent.runDraftQa
 */

import { describe, expect, it } from 'vitest';
import { runDraftQa } from '../src/services/qa/draftQaAgent.js';

describe('draftQaAgent.runDraftQa', () => {
  it('returns qaReport with required shape', () => {
    const draft = {
      preview: {
        items: [
          { id: '1', name: 'Latte', imageUrl: 'https://example.com/1.jpg' },
          { id: '2', name: 'Espresso', imageUrl: null },
        ],
        hero: { imageUrl: 'https://example.com/hero.jpg' },
        avatar: { imageUrl: 'https://example.com/avatar.jpg' },
      },
    };
    const report = runDraftQa(draft);
    expect(report).toHaveProperty('totalItems', 2);
    expect(report).toHaveProperty('itemsWithImages', 1);
    expect(report).toHaveProperty('itemsWithoutImages', 1);
    expect(report).toHaveProperty('hasHero', true);
    expect(report).toHaveProperty('hasAvatar', true);
    expect(report).toHaveProperty('score');
    expect(report).toHaveProperty('issues');
    expect(report).toHaveProperty('computedAt');
    expect(Array.isArray(report.issues)).toBe(true);
  });

  it('includes qaReport after finalizeDraft-style preview (items, hero, avatar)', () => {
    const draft = {
      preview: {
        items: [
          { id: '1', name: 'Item', imageUrl: 'https://a.com/1.jpg' },
          { id: '2', name: 'Item2', imageUrl: 'https://a.com/2.jpg' },
        ],
        hero: { imageUrl: 'https://a.com/hero.jpg' },
        avatar: { imageUrl: 'https://a.com/avatar.jpg' },
      },
    };
    const report = runDraftQa(draft);
    expect(report.totalItems).toBe(2);
    expect(report.itemsWithImages).toBe(2);
    expect(report.itemsWithoutImages).toBe(0);
    expect(report.hasHero).toBe(true);
    expect(report.hasAvatar).toBe(true);
    expect(report.issues).not.toContain('Missing hero image');
    expect(report.issues).not.toContain('Missing avatar/logo');
  });

  it('reports issues when hero/avatar missing', () => {
    const draft = {
      preview: {
        items: [{ id: '1', name: 'Item', imageUrl: null }],
      },
    };
    const report = runDraftQa(draft);
    expect(report.hasHero).toBe(false);
    expect(report.hasAvatar).toBe(false);
    expect(report.issues).toContain('Missing hero image');
    expect(report.issues).toContain('Missing avatar/logo');
    expect(report.issues).toContain('1 product(s) missing images');
  });

  it('handles catalog.products when items absent', () => {
    const draft = {
      preview: {
        catalog: {
          products: [
            { id: 'p1', name: 'Product', imageUrl: 'https://x.com/1.jpg' },
          ],
        },
      },
    };
    const report = runDraftQa(draft);
    expect(report.totalItems).toBe(1);
    expect(report.itemsWithImages).toBe(1);
  });

  it('adds LOW_IMAGE_CONFIDENCE issue when items have imageConfidence < 0.6', () => {
    const draft = {
      preview: {
        items: [
          { id: 'a', name: 'Item A', imageUrl: 'https://x.com/a.jpg', imageConfidence: 0.5 },
          { id: 'b', name: 'Item B', imageUrl: 'https://x.com/b.jpg', imageConfidence: 0.7 },
        ],
        hero: { imageUrl: 'https://x.com/h.jpg' },
        avatar: { imageUrl: 'https://x.com/v.jpg' },
      },
    };
    const report = runDraftQa(draft);
    expect(report.issueCodes).toContain('LOW_IMAGE_CONFIDENCE');
    expect(report.issues.some((i) => i.includes('Low confidence') && i.includes('a'))).toBe(true);
  });

  it('adds DUPLICATE_IMAGE issue when same imageUrl used by >2 items', () => {
    const sameUrl = 'https://x.com/same.jpg';
    const draft = {
      preview: {
        items: [
          { id: '1', name: 'A', imageUrl: sameUrl },
          { id: '2', name: 'B', imageUrl: sameUrl },
          { id: '3', name: 'C', imageUrl: sameUrl },
        ],
        hero: { imageUrl: 'https://x.com/h.jpg' },
        avatar: { imageUrl: 'https://x.com/v.jpg' },
      },
    };
    const report = runDraftQa(draft);
    expect(report.issueCodes).toContain('DUPLICATE_IMAGE');
    expect(report.issues.some((i) => i.includes('Duplicate image'))).toBe(true);
  });
});
