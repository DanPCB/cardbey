import { describe, it, expect } from 'vitest';
import {
  buildItemsFromExtraction,
  mergeExtractionIntoDraftPreview,
} from '../draftPreviewMerge.js';

const AA_TRAVEL = {
  business: { name: 'AA Travel' },
  campaign: { name: 'Asia Golf 2026' },
  products: [
    {
      name: 'Vietnam Golf Package',
      location: 'Vietnam',
      highlights: ['3 championship rounds'],
      includes: ['5 nights', 'gala dinner'],
      pricing: [{ price: 1388, currency: 'AUD' }],
      deadline: '2026-08-01',
    },
  ],
  contacts: [{ name: 'Mark', phone: '+61 400 000 000' }],
};

describe('draftPreviewMerge', () => {
  it('buildItemsFromExtraction sets featuredInShow and source', () => {
    const items = buildItemsFromExtraction(AA_TRAVEL);
    expect(items).toHaveLength(1);
    expect(items[0].featuredInShow).toBe(true);
    expect(items[0].source).toBe('document_ingestion');
    expect(items[0].price).toBe(1388);
  });

  it('mergeExtractionIntoDraftPreview adds items and show section works', () => {
    const merged = mergeExtractionIntoDraftPreview(
      {
        items: [{ id: 'existing-1', name: 'Golf Cart Rental' }],
        website: { sections: [{ type: 'hero', content: { headline: 'AA Travel' } }] },
      },
      AA_TRAVEL,
    );
    expect(merged.items).toHaveLength(2);
    expect(merged.documentContext?.source).toBe('document_ingestion');
    const showSection = merged.website?.sections?.find((s) => s.type === 'show');
    expect(showSection?.content?.items?.length).toBeGreaterThan(0);
    expect(showSection.content.items[0].title).toBe('Vietnam Golf Package');
  });
});
