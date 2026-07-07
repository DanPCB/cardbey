import { describe, it, expect } from 'vitest';
import { buildResearchDebuggerSnapshot } from '../buildResearchDebuggerSnapshot.js';

describe('buildResearchDebuggerSnapshot', () => {
  it('maps matched channels with confidence', () => {
    const snapshot = buildResearchDebuggerSnapshot(
      { businessName: 'Glamshell Beauty', location: 'Williamstown' },
      {
        researchRan: true,
        fallbackToGenerated: false,
        ownerReviewRequired: true,
        confidence: 0.82,
        facts: {
          businessName: { value: 'Glamshell Beauty', confidence: 0.95, sourceType: 'manual' },
          address: { value: 'Williamstown', confidence: 0.7, sourceType: 'booking_platform' },
        },
        businessProfile: {
          businessType: 'service_fixed_booking',
          commerceType: 'service',
          executionModel: 'book',
          catalogMode: 'services',
          pricingModel: 'fixed',
          fulfillmentModel: 'appointment',
          customerJourney: 'browse_book',
          primaryCTA: 'Book now',
          catalogLabel: 'Services',
          capabilities: { booking: true, calendar: true, cart: false },
        },
        catalog: {
          meta: { catalogSource: 'research', researchConfidence: 0.82, aiGenerated: false },
          products: [{ id: 'p1', name: 'SNS', price: 40, category: 'Nails' }],
        },
        sourcesUsed: [
          {
            matched: true,
            confidence: 0.96,
            reasons: ['name_match'],
            source: {
              sourceType: 'google_business',
              sourceUrl: 'https://maps.google.com/example',
            },
          },
          {
            matched: true,
            confidence: 0.88,
            reasons: ['website_match'],
            source: {
              sourceType: 'official_website',
              sourceUrl: 'https://glamshell.example',
            },
          },
          {
            matched: true,
            confidence: 0.9,
            reasons: ['bookwell_listing'],
            source: {
              sourceType: 'booking_platform',
              sourceUrl: 'https://www.bookwell.com.au/venue/glamshell-beauty/williamstown/3016',
            },
          },
          {
            matched: true,
            confidence: 0.85,
            reasons: ['social_match'],
            source: {
              sourceType: 'instagram',
              sourceUrl: 'https://instagram.com/glamshell',
            },
          },
        ],
        sourcesPendingConfirmation: [],
        extractedItems: [{ name: 'SNS', price: 40, durationMinutes: 45, sourceType: 'booking_platform' }],
      },
    );

    expect(snapshot.businessName).toBe('Glamshell Beauty');
    expect(snapshot.location).toBe('Williamstown');
    expect(snapshot.channels).toHaveLength(4);
    expect(snapshot.channels.find((c) => c.id === 'google_places')?.matched).toBe(true);
    expect(snapshot.channels.find((c) => c.id === 'google_places')?.confidence).toBe(0.96);
    expect(snapshot.channels.find((c) => c.id === 'bookwell')?.matched).toBe(true);
    expect(snapshot.services).toHaveLength(1);
    expect(snapshot.capabilities).toEqual(expect.arrayContaining(['booking', 'calendar']));
    expect(snapshot.generatedCatalog.itemCount).toBe(1);
  });

  it('marks Google Places as skipped when API key is missing', () => {
    const prev = process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;
    try {
      const snapshot = buildResearchDebuggerSnapshot(
        { businessName: 'Test Salon', location: 'Melbourne' },
        {
          researchRan: true,
          fallbackToGenerated: true,
          ownerReviewRequired: true,
          confidence: 0,
          facts: null,
          businessProfile: null,
          catalog: null,
          sourcesUsed: [],
          sourcesPendingConfirmation: [],
        },
      );
      const google = snapshot.channels.find((c) => c.id === 'google_places');
      expect(google?.status).toBe('skipped');
      expect(google?.matched).toBe(false);
    } finally {
      if (prev != null) process.env.GOOGLE_PLACES_API_KEY = prev;
    }
  });
});
