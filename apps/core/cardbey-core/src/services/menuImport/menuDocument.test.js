import { describe, expect, it } from 'vitest';
import { mergeMenuImportExtractions } from './menuImportMerge.js';
import { buildMenuDocument, summarizeMenuDocument } from './menuDocument.js';

/** Mirrors the spa/beauty brochure: packages, duration variants, add-ons, waxing list. */
function spaMerged() {
  return mergeMenuImportExtractions([
    {
      assetId: 'a1',
      sourceOrder: 1,
      items: [
        {
          name: 'Refresh',
          price: 69,
          currency: 'AUD',
          category: 'Spa Packages',
          durationMinutes: 30,
          inclusions: ['Herbal shampoo hair wash', 'Conditioning treatment', 'Head massage'],
          confidence: 0.95,
        },
        {
          name: 'Rejuvenate',
          price: 169,
          currency: 'AUD',
          category: 'Spa Packages',
          durationMinutes: 90,
          inclusions: ['Herbal shampoo hair wash', 'Full body massage'],
          confidence: 0.9,
        },
        {
          name: 'Relaxation or Deep Tissue',
          price: 70,
          currency: 'AUD',
          category: 'Massage',
          options: [
            { label: '30 mins', durationMinutes: 30, price: 70 },
            { label: '45 mins', durationMinutes: 45, price: 80 },
            { label: '60 mins', durationMinutes: 60, price: 110 },
            { label: '90 mins', durationMinutes: 90, price: 130 },
          ],
          addOns: [{ name: 'Hot stone', price: 10 }],
          confidence: 0.6,
        },
        { name: 'Eyebrow', price: 15, currency: 'AUD', category: 'Waxing', confidence: 0.9 },
        { name: 'Brazilian', price: 59, currency: 'AUD', category: 'Waxing', confidence: 0.9 },
      ],
    },
  ]);
}

describe('buildMenuDocument', () => {
  it('preserves sections, offerings, duration variants and add-ons', () => {
    const doc = buildMenuDocument(spaMerged(), { currency: 'AUD' });

    expect(doc.version).toBe(1);
    expect(doc.currency).toBe('AUD');
    expect(doc.sections.map((s) => s.name)).toEqual(['Spa Packages', 'Massage', 'Waxing']);

    const massage = doc.sections.find((s) => s.name === 'Massage');
    const offering = massage.offerings[0];
    expect(offering.name).toMatch(/relaxation/i);
    expect(offering.variants).toHaveLength(4);
    expect(offering.variants[3]).toMatchObject({ durationMinutes: 90, price: 130 });
    expect(offering.addOns[0]).toMatchObject({ name: 'Hot stone', price: 10 });

    const spa = doc.sections.find((s) => s.name === 'Spa Packages');
    expect(spa.offerings.find((o) => o.name === 'Refresh')?.inclusions).toHaveLength(3);
  });

  it('computes stats and a low-confidence flag', () => {
    const doc = buildMenuDocument(spaMerged());
    expect(doc.stats.sectionCount).toBe(3);
    expect(doc.stats.offeringCount).toBe(5);
    expect(doc.stats.variantCount).toBe(4);
    expect(doc.stats.addOnCount).toBe(1);
    expect(doc.stats.lowConfidenceCount).toBe(1); // the 0.6 massage row
  });

  it('preserves source evidence refs on offerings', () => {
    const doc = buildMenuDocument(spaMerged());
    const refs = doc.sections.flatMap((s) => s.offerings).flatMap((o) => o.sourceRefs);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0]).toHaveProperty('assetId');
  });

  it('falls back to Menu section and AUD when unlabeled', () => {
    const doc = buildMenuDocument({ items: [{ name: 'Mystery item', price: 5, confidence: 0.9 }] });
    expect(doc.sections[0].name).toBe('Menu');
    expect(doc.currency).toBe('AUD');
  });

  it('summary is agent-first and human readable', () => {
    const doc = buildMenuDocument(spaMerged());
    expect(summarizeMenuDocument(doc)).toBe(
      '3 sections · 5 services · 4 duration options · 1 add-on · 1 need review',
    );
    expect(summarizeMenuDocument(null)).toBe('No menu structure detected');
  });
});
