import { describe, expect, it, beforeEach } from 'vitest';
import { scoreSourceMatch, aggregateResearchConfidence, attachOfficialWebsiteWhenGbpMatches } from '../sourceConfidenceScorer.js';
import { extractBusinessFacts } from '../businessFactsExtractor.js';
import { extractServiceMenuCatalog, classifyBusinessKind } from '../serviceMenuExtractor.js';
import { buildResearchBackedStore } from '../researchBackedStoreBuilder.js';
import { shouldRunStoreCreationResearch, runStoreCreationResearch } from '../businessResearchAgent.js';
import { clearResearchEvidenceForTests } from '../researchEvidenceRepository.js';
import { buildBusinessProfile } from '../../businessSemantic/BusinessProfileBuilder.js';

beforeEach(() => {
  clearResearchEvidenceForTests();
});

describe('shouldRunStoreCreationResearch', () => {
  it('runs when business name and website are present', () => {
    expect(
      shouldRunStoreCreationResearch(
        { businessName: 'Glamshell Beauty' },
        { website: 'https://glamshell.example' },
      ),
    ).toBe(true);
  });

  it('does not run without identity signals', () => {
    expect(shouldRunStoreCreationResearch({ businessName: 'Glamshell Beauty' }, {})).toBe(false);
  });

  it('runs when business name and category are present', () => {
    expect(
      shouldRunStoreCreationResearch({ businessName: 'Glamshell Beauty' }, { businessType: 'Salon' }),
    ).toBe(true);
  });
});

describe('Glamshell Beauty — service_fixed_booking', () => {
  const identity = {
    businessName: 'Glamshell Beauty',
    location: 'Sydney NSW',
    phone: '0299990000',
    website: 'https://glamshell.example',
  };

  const matchedSources = [
    {
      matched: true,
      confidence: 0.88,
      reasons: ['name-exact', 'phone'],
      source: {
        sourceType: 'official_website',
        sourceUrl: 'https://glamshell.example',
        raw: {
          name: 'Glamshell Beauty',
          phone: '0299990000',
          offers: [
            { name: 'Classic Manicure', price: 45, description: 'Shellac finish' },
            { name: 'Hydrating Facial', price: 80, description: '60 min treatment' },
          ],
        },
        priority: 0,
      },
    },
  ];

  it('classifies beauty business as service_fixed_booking', () => {
    expect(classifyBusinessKind('Glamshell Beauty nails spa salon')).toBe('service_fixed_booking');
  });

  it('extracts bookable services with real names and prices', () => {
    const facts = extractBusinessFacts(matchedSources, identity);
    const { items, businessKind } = extractServiceMenuCatalog(facts, matchedSources, identity);
    expect(businessKind).toBe('service_fixed_booking');
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0].executionAction).toBe('book');
    expect(items[0].serviceMode).toBe('fixed_booking');
    expect(items.find((i) => /manicure/i.test(i.name))?.price).toBe(45);
  });

  it('builds BSL profile with booking capability — not retail Products', () => {
    const facts = extractBusinessFacts(matchedSources, identity);
    const { items, businessKind } = extractServiceMenuCatalog(facts, matchedSources, identity);
    const built = buildResearchBackedStore({
      facts,
      items,
      businessKind,
      input: identity,
      confidence: 0.88,
    });
    expect(built.businessProfile.businessType).toBe('service_fixed_booking');
    expect(built.businessProfile.presentation.primaryCTA).toMatch(/book/i);
    expect(built.businessProfile.presentation.catalogLabel).not.toMatch(/^products$/i);
    expect(built.catalog.meta.catalogSource).toBe('research');
  });
});

describe('Tiling company — service_quote_required', () => {
  const identity = {
    businessName: 'AAA Tiles and Floor',
    location: 'Melbourne VIC',
    website: 'https://aaatiles.example',
  };

  const matchedSources = [
    {
      matched: true,
      confidence: 0.82,
      reasons: ['name-partial', 'website'],
      source: {
        sourceType: 'official_website',
        sourceUrl: 'https://aaatiles.example',
        raw: {
          name: 'AAA Tiles and Floor',
          offers: [
            { name: 'Ceramic Floor Tiling', description: 'Residential installation' },
            { name: 'Consultation', price: 0 },
          ],
        },
        priority: 0,
      },
    },
  ];

  it('classifies tiling as quote_required', () => {
    expect(classifyBusinessKind('AAA Tiles and Floor tiling installation')).toBe('service_quote_required');
  });

  it('uses Request quote CTA — no fake fixed prices on quote services', () => {
    const facts = extractBusinessFacts(matchedSources, identity);
    const { items, businessKind } = extractServiceMenuCatalog(facts, matchedSources, identity);
    const tiling = items.find((i) => /ceramic/i.test(i.name));
    expect(tiling?.executionAction).toBe('request_quote');
    expect(tiling?.serviceMode).toBe('quote_required');
    expect(tiling?.needsOwnerReview).toBe(true);

    const built = buildResearchBackedStore({
      facts,
      items,
      businessKind,
      input: identity,
      confidence: 0.82,
    });
    expect(built.businessProfile.businessType).toBe('service_quote_required');
    expect(built.businessProfile.presentation.primaryCTA).toMatch(/quote/i);
  });
});

describe('Restaurant — food menu', () => {
  const identity = { businessName: 'Harbour Cafe', location: 'Sydney', category: 'Restaurant' };
  const matchedSources = [
    {
      matched: true,
      confidence: 0.8,
      reasons: ['name-exact'],
      source: {
        sourceType: 'google_business',
        sourceUrl: 'https://maps.google.com',
        raw: {
          name: 'Harbour Cafe',
          category: 'Restaurant',
          offers: [
            { name: 'Flat White', price: 5.5 },
            { name: 'Avocado Toast', price: 18 },
          ],
        },
        priority: 0,
      },
    },
  ];

  it('extracts menu items with Order CTA', () => {
    const facts = extractBusinessFacts(matchedSources, identity);
    const { items, businessKind } = extractServiceMenuCatalog(facts, matchedSources, identity);
    expect(businessKind).toBe('food_menu');
    expect(items[0].executionAction).toBe('add_to_cart');

    const built = buildResearchBackedStore({
      facts,
      items,
      businessKind,
      input: identity,
      confidence: 0.8,
    });
    expect(built.businessProfile.businessType).toBe('food_menu');
    expect(built.businessProfile.presentation.catalogLabel).toMatch(/menu/i);
  });
});

describe('No online data — fallback', () => {
  it('falls back when skipNetwork is set', async () => {
    const result = await runStoreCreationResearch(
      { businessName: 'Mystery Shop', website: 'https://example.com', missionId: 'm1' },
      { skipNetwork: true },
    );
    expect(result.fallbackToGenerated).toBe(true);
    expect(result.catalog).toBeNull();
    expect(result.logs).toContain('[STORE_RESEARCH_FALLBACK_USED]');
  });
});

describe('Bookwell venue — Melbourne metro vs Williamstown suburb', () => {
  it('matches Bookwell venue slug even when user location is broader', () => {
    const source = {
      sourceType: 'booking_platform',
      sourceUrl: 'https://www.bookwell.com.au/venue/glamshell-beauty/williamstown/3016',
      raw: {
        name: 'Glamshell Beauty',
        businessName: 'Glamshell Beauty',
        location: '63 Ferguson Street, Williamstown 3016',
        discoveryVia: 'bookwell_listing',
        offers: [{ name: 'SNS (on natural nails)', price: 40, durationMinutes: 40 }],
      },
      priority: 0,
    };
    const match = scoreSourceMatch(source, {
      businessName: 'Glamshell Beauty',
      location: 'Melbourne',
      category: 'Beauty',
    });
    expect(match.matched).toBe(true);
    expect(match.confidence).toBeGreaterThanOrEqual(0.9);
    expect(match.reasons).toContain('bookwell-venue-menu');
  });
});

describe('Google Places — metro location vs suburb address', () => {
  it('matches google_business when place name aligns with business name', () => {
    const source = {
      sourceType: 'google_business',
      sourceUrl: 'https://maps.google.com/?cid=123',
      raw: {
        name: 'Glamshell Beauty Spa',
        businessName: 'Glamshell Beauty Spa',
        placeId: 'ChIJP8mFEelm1moRYtJIRMSro94',
        address: 'shop2 / 63/65 Ferguson St, Williamstown VIC 3061, Australia',
        rating: 4.6,
        reviewCount: 89,
        discoveryVia: 'google_places_new',
      },
      priority: 0,
    };
    const match = scoreSourceMatch(source, {
      businessName: 'Glamshell Beauty',
      location: 'Melbourne',
      category: 'Beauty',
    });
    expect(match.matched).toBe(true);
    expect(match.confidence).toBeGreaterThanOrEqual(0.88);
    expect(match.reasons).toContain('google-place-name');
  });

  it('keeps hostname-titled website offers when GBP matched the same host', () => {
    const identity = {
      businessName: 'Modern Security Doors',
      location: 'Ravenhall VIC 3023',
    };
    const gbp = scoreSourceMatch(
      {
        sourceType: 'google_business',
        sourceUrl: 'https://maps.google.com/?cid=1',
        raw: {
          name: 'MODERN SECURITY DOORS',
          placeId: 'ChIJ-msd',
          website: 'http://modernsecuritydoors.com.au',
          rating: 4.8,
          address: 'Ravenhall VIC 3023',
        },
        priority: 1,
      },
      identity,
    );
    const website = scoreSourceMatch(
      {
        sourceType: 'official_website',
        sourceUrl: 'http://modernsecuritydoors.com.au',
        raw: {
          name: 'modernsecuritydoors.com.au',
          website: 'http://modernsecuritydoors.com.au',
          offers: [{ name: 'Roller Shutters' }, { name: 'Fly Doors' }],
        },
        priority: 0,
      },
      identity,
    );
    expect(website.matched).toBe(false);

    const attached = attachOfficialWebsiteWhenGbpMatches([gbp, website]);
    const site = attached.find((m) => m.source.sourceType === 'official_website');
    expect(site.matched).toBe(true);
    expect(site.reasons).toContain('google-place-website');
    expect(site.source.raw.offers.length).toBe(2);
  });

  it('does not attach a different-host website to a GBP match', () => {
    const attached = attachOfficialWebsiteWhenGbpMatches([
      {
        matched: true,
        confidence: 0.94,
        reasons: ['google-place-name'],
        source: {
          sourceType: 'google_business',
          raw: { website: 'http://modernsecuritydoors.com.au', name: 'MODERN SECURITY DOORS' },
        },
      },
      {
        matched: false,
        confidence: 0.1,
        reasons: [],
        source: {
          sourceType: 'official_website',
          sourceUrl: 'https://other-doors.example',
          raw: { name: 'other-doors.example', offers: [{ name: 'Wrong shop' }] },
        },
      },
    ]);
    expect(attached[1].matched).toBe(false);
  });
});

describe('Low-confidence source — owner review', () => {
  it('flags owner review when match confidence is low', () => {
    const source = {
      sourceType: 'directory',
      sourceUrl: 'https://directory.example/other-salon',
      raw: { name: 'Different Salon Name', phone: '0211112222' },
      priority: 0,
    };
    const match = scoreSourceMatch(source, {
      businessName: 'Glamshell Beauty',
      phone: '0299990000',
      location: 'Sydney',
    });
    expect(match.confidence).toBeLessThan(0.55);
    expect(match.matched).toBe(false);
  });
});

describe('BSL integration', () => {
  it('feeds BusinessProfileBuilder from extracted items only', () => {
    const { profile } = buildBusinessProfile({
      businessName: 'Gold Nails',
      businessType: 'Beauty',
      items: [
        { name: 'Classic Manicure', itemType: 'service', serviceMode: 'fixed_booking', executionAction: 'book' },
      ],
    });
    expect(profile.businessType).toBe('service_fixed_booking');
    expect(profile.capabilities.booking).toBe(true);
  });
});
