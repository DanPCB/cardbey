import { describe, expect, it } from 'vitest';
import {
  buildCurrentBusinessSignals,
  deltaScorecard,
  scorecardFromSignals,
} from '../computeCurrentBusinessScores.js';

describe('computeCurrentBusinessScores', () => {
  it('scores higher when store has offers, loyalty, and devices', () => {
    const sparse = buildCurrentBusinessSignals({
      store: { name: 'Cafe' },
      profileCompleteness: 25,
    });
    const rich = buildCurrentBusinessSignals({
      store: {
        name: 'Cafe',
        website: 'https://cafe.example',
        phone: '+61123456789',
        address: '1 Main St',
        description: 'Great coffee',
        heroImageUrl: 'https://cdn.example/hero.jpg',
        socialLinks: { instagram: 'https://instagram.com/cafe' },
      },
      activeOfferCount: 2,
      activeCampaignCount: 1,
      loyaltyProgramCount: 1,
      contentDocumentCount: 3,
      screenCount: 1,
      profileCompleteness: 85,
    });

    const before = scorecardFromSignals(sparse);
    const after = scorecardFromSignals(rich);
    const deltas = deltaScorecard(before, after);

    expect(deltas.visibilityScore).toBeGreaterThan(0);
    expect(deltas.engagementReadinessScore).toBeGreaterThan(0);
    expect(deltas.distributionCoverage).toBeGreaterThan(0);
  });
});
