import { describe, expect, it } from 'vitest';
import { buildResearchEvidenceSnapshot } from '../researchEvidenceRepository.js';

function makeMatch({
  sourceType,
  sourceUrl,
  confidence = 0.8,
  reasons = ['name-exact'],
  raw = {},
}) {
  return {
    matched: true,
    confidence,
    reasons,
    source: {
      sourceType,
      sourceUrl,
      raw,
      priority: 0,
    },
  };
}

describe('Research Evidence Layer V1', () => {
  it('captures Google + Bookwell evidence for Glamshell Beauty', () => {
    const snapshot = buildResearchEvidenceSnapshot({
      input: { businessName: 'Glamshell Beauty', location: 'Williamstown VIC', category: 'Beauty' },
      scoredSources: [
        makeMatch({
          sourceType: 'google_business',
          sourceUrl: 'https://maps.google.com/?cid=123',
          confidence: 0.91,
          raw: { name: 'Glamshell Beauty', phone: '0399990000', category: 'Beauty Salon' },
        }),
        makeMatch({
          sourceType: 'booking_platform',
          sourceUrl: 'https://www.bookwell.com.au/venue/glamshell-beauty',
          confidence: 0.88,
          raw: {
            name: 'Glamshell Beauty',
            discoveryVia: 'bookwell_listing',
            offers: [{ name: 'Classic Manicure', price: 45, durationMinutes: 40, category: 'Nails' }],
          },
        }),
      ],
      result: { fallbackToGenerated: false, businessProfile: { businessType: 'service_fixed_booking', catalogMode: 'services' } },
    });

    expect(snapshot.providerResults.some((row) => row.providerId === 'google_business_profile')).toBe(true);
    expect(snapshot.providerResults.some((row) => row.providerId === 'bookwell')).toBe(true);
    expect(snapshot.businessKnowledgeGraph.businessIdentity.businessName).toBe('Glamshell Beauty');
    expect(snapshot.businessKnowledgeGraph.services.some((svc) => /manicure/i.test(svc.name))).toBe(true);
  });

  it('preserves quote-required tiling services', () => {
    const snapshot = buildResearchEvidenceSnapshot({
      input: { businessName: 'AAA Tiles and Floor', location: 'Melbourne VIC', category: 'Tiling' },
      scoredSources: [
        makeMatch({
          sourceType: 'official_website',
          sourceUrl: 'https://aaatiles.example',
          confidence: 0.82,
          raw: {
            name: 'AAA Tiles and Floor',
            offers: [{ name: 'Ceramic Floor Tiling', category: 'Trades', description: 'Installation quote' }],
          },
        }),
      ],
      result: { fallbackToGenerated: false, businessProfile: { businessType: 'service_quote_required', catalogMode: 'services' } },
    });

    expect(snapshot.businessKnowledgeGraph.services[0]?.name).toContain('Ceramic');
    expect(snapshot.businessKnowledgeGraph.legacyCatalogPreview.businessType).toBe('service_quote_required');
  });

  it('captures restaurant menu items', () => {
    const snapshot = buildResearchEvidenceSnapshot({
      input: { businessName: 'Harbour Cafe', category: 'Restaurant' },
      scoredSources: [
        makeMatch({
          sourceType: 'google_business',
          sourceUrl: 'https://maps.google.com/?cid=rest1',
          confidence: 0.84,
          raw: {
            name: 'Harbour Cafe',
            category: 'Restaurant',
            offers: [
              { name: 'Flat White', price: 5.5, category: 'Menu' },
              { name: 'Avocado Toast', price: 18, category: 'Menu' },
            ],
          },
        }),
      ],
      result: { fallbackToGenerated: false, businessProfile: { businessType: 'food_menu', catalogMode: 'menu' } },
    });

    expect(snapshot.businessKnowledgeGraph.menuItems).toHaveLength(2);
  });

  it('lets uploaded brochure outrank lower-tier internet evidence after merge', () => {
    const snapshot = buildResearchEvidenceSnapshot({
      input: { businessName: 'TradeCo', category: 'Trades', ocrText: 'TradeCo brochure' },
      scoredSources: [
        makeMatch({
          sourceType: 'official_website',
          sourceUrl: 'https://tradeco.example',
          confidence: 0.8,
          raw: { name: 'TradeCo', phone: '0311112222' },
        }),
        makeMatch({
          sourceType: 'uploaded_document',
          sourceUrl: null,
          confidence: 0.9,
          raw: { name: 'TradeCo', phone: '0399998888', ocrText: 'brochure price list' },
        }),
      ],
      result: { fallbackToGenerated: false, businessProfile: { businessType: 'service_quote_required' } },
    });

    expect(snapshot.businessKnowledgeGraph.contacts.find((row) => row.type === 'phone')?.value).toBe('0399998888');
  });

  it('uses AI fallback when there is no evidence', () => {
    const snapshot = buildResearchEvidenceSnapshot({
      input: { businessName: 'Mystery Shop' },
      scoredSources: [],
      result: { fallbackToGenerated: true },
    });

    expect(snapshot.providerResults).toHaveLength(1);
    expect(snapshot.providerResults[0].providerId).toBe('ai_template');
    expect(snapshot.businessKnowledgeGraph.ownerVerification.ownerReviewRequired).toBe(true);
  });

  it('marks conflicting facts for owner review', () => {
    const snapshot = buildResearchEvidenceSnapshot({
      input: { businessName: 'Conflict Salon' },
      scoredSources: [
        makeMatch({
          sourceType: 'google_business',
          sourceUrl: 'https://maps.google.com/?cid=1',
          confidence: 0.9,
          raw: { name: 'Conflict Salon', phone: '0311111111' },
        }),
        makeMatch({
          sourceType: 'official_website',
          sourceUrl: 'https://conflict.example',
          confidence: 0.88,
          raw: { name: 'Conflict Salon', phone: '0322222222' },
        }),
      ],
      result: { fallbackToGenerated: false },
    });

    expect(snapshot.mergedEvidence.conflicts.some((row) => row.fieldPath === 'phone')).toBe(true);
    expect(snapshot.businessKnowledgeGraph.ownerVerification.ownerReviewRequired).toBe(true);
  });
});
