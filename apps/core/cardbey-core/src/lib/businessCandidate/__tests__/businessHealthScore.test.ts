import { describe, expect, it } from 'vitest';
import {
  buildBusinessHealthScore,
  buildHealthScoreSignals,
} from '../brief/businessHealthScore.js';
import type { BusinessCandidateRecord } from '../types.js';
import type { VisibilityScores } from '../brief/types.js';

function sampleCandidate(overrides: Partial<BusinessCandidateRecord> = {}): BusinessCandidateRecord {
  const now = new Date().toISOString();
  return {
    id: 'cand-health-1',
    batchId: 'MELBOURNE_BATCH001_REAL_LOCAL',
    campaignId: 'campaign',
    name: 'Sunshine Nails',
    businessType: 'nail salon',
    address: '1 Main St, Footscray',
    suburb: 'Footscray',
    city: 'Footscray',
    state: 'VIC',
    postcode: '3011',
    country: 'AU',
    phone: '+61400000000',
    website: 'https://nails.example',
    email: null,
    socialLinks: [],
    coordinates: { lat: -37.8, lng: 144.9 },
    discoveredFrom: 'google',
    confidenceScore: 0.85,
    originalContent: { description: 'Local nail studio' },
    fetchedImages: [],
    fetchedMenu: null,
    fetchedServices: [{ name: 'Manicure' }],
    missingFields: [],
    ownerMatched: false,
    ownerId: null,
    storeDraftId: null,
    storeId: null,
    missionId: null,
    placeId: 'place-1',
    sourceUrl: null,
    rawSourceJson: { opening_hours: { weekday_text: ['Mon 9-5'] } },
    seedId: 'seed-1',
    status: 'CLAIMABLE',
    dedupeKey: 'dedupe-1',
    discoveryProviderId: 'google_places',
    externalId: 'ext-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const baseVisibility: VisibilityScores = {
  overall: 72,
  seoReadiness: 78,
  geoReadiness: 65,
  onlinePresence: 70,
  profileCompleteness: 75,
  confidenceLevel: 'medium',
};

describe('businessHealthScore', () => {
  it('builds all five pillars with sub-metrics', () => {
    const candidate = sampleCandidate();
    const health = buildBusinessHealthScore(candidate, null, baseVisibility);
    expect(health.pillars).toHaveLength(5);
    expect(health.pillars.map((p) => p.key)).toEqual([
      'visibility',
      'trust',
      'content',
      'customer_experience',
      'commerce_readiness',
    ]);
    expect(health.overallReadiness).toBeGreaterThan(0);
    expect(health.overallReadiness).toBeLessThanOrEqual(100);
  });

  it('does not fabricate review scores without evidence', () => {
    const candidate = sampleCandidate({ rawSourceJson: null });
    const signals = buildHealthScoreSignals(candidate, null);
    expect(signals.hasReviews).toBe(false);
    const health = buildBusinessHealthScore(candidate, null, baseVisibility);
    const cx = health.pillars.find((p) => p.key === 'customer_experience');
    const reviews = cx?.subMetrics.find((s) => s.key === 'reviews');
    expect(reviews?.score).toBeNull();
    expect(reviews?.status).toBe('insufficient_evidence');
  });

  it('scores reviews only when provider data exists', () => {
    const candidate = sampleCandidate({
      rawSourceJson: { user_ratings_total: 42, rating: 4.5 },
    });
    const signals = buildHealthScoreSignals(candidate, null);
    expect(signals.hasReviews).toBe(true);
    const health = buildBusinessHealthScore(candidate, null, baseVisibility);
    const reviews = health.pillars
      .find((p) => p.key === 'customer_experience')
      ?.subMetrics.find((s) => s.key === 'reviews');
    expect(reviews?.score).toBeGreaterThan(0);
    expect(reviews?.detail).toContain('42');
  });

  it('marks commerce features as post_claim for discovered businesses', () => {
    const health = buildBusinessHealthScore(sampleCandidate(), null, baseVisibility);
    const commerce = health.pillars.find((p) => p.key === 'commerce_readiness');
    const promo = commerce?.subMetrics.find((s) => s.key === 'promotions');
    expect(promo?.score).toBe(0);
    expect(promo?.status).toBe('post_claim');
  });

  it('identity verification is zero until owner verified', () => {
    const health = buildBusinessHealthScore(sampleCandidate(), null, baseVisibility);
    const trust = health.pillars.find((p) => p.key === 'trust');
    const idv = trust?.subMetrics.find((s) => s.key === 'identity_verification');
    expect(idv?.score).toBe(0);
  });
});
