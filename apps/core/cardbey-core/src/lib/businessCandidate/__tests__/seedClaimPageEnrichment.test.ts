import { describe, expect, it } from 'vitest';
import { resolveSeedRepresentativeHero } from '../media/resolveSeedRepresentativeHero.js';
import { resolveDiscoveryCardHero } from '../../businessIngestion/DiscoveryCardHeroResolver.js';
import { generateBusinessIntelligenceBriefForSeed } from '../brief/generateBusinessIntelligenceBrief.js';
import { buildIngestedSeedRecord } from '../../businessIngestion/SeedGovernance.js';
import type { NormalizedBusinessRecord } from '../../businessIngestion/types.js';
import { resetBriefsForTests } from '../brief/briefRepository.js';

const STEAK_FOOD_URL =
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=1200&auto=format&fit=crop';
const BAKERY_URL =
  'https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=1200&auto=format&fit=crop';

function cupcakeSeed() {
  const normalized: NormalizedBusinessRecord = {
    id: 'cupcake-seed-1',
    businessName: 'Cupcakes by',
    legalName: null,
    address: '28C Ashley Street',
    phone: null,
    website: null,
    category: 'food',
    categoryConfidence: 0.7,
    registrationNumber: null,
    email: null,
    operatingRegion: 'AU-VIC',
    country: 'Australia',
    state: 'VIC',
    city: 'Melbourne',
    confidenceScore: 0.75,
    sourceType: 'open_data_url',
    sourceReference: 'test',
    sourceRowId: '1',
    ingestedAt: new Date().toISOString(),
  };
  return buildIngestedSeedRecord({
    normalized,
    resolution: 'unique',
    matchEvidence: [],
    qualityScore: 70,
    qualityTier: 'medium_quality',
  });
}

describe('seed claim page enrichment', () => {
  it('Cupcakes by + food category resolves to bakery hero not steak food stock', () => {
    const seed = cupcakeSeed();
    const hero = resolveDiscoveryCardHero(seed);
    expect(hero.heroImageUrl).toBe(BAKERY_URL);
    expect(hero.heroImageUrl).not.toBe(STEAK_FOOD_URL);
    expect(resolveSeedRepresentativeHero(seed).categoryKey).toBe('bakery');
  });

  it('generates BI brief and health score for seed without BusinessCandidate', async () => {
    await resetBriefsForTests();
    const seed = { ...cupcakeSeed(), claimable: true };
    const brief = await generateBusinessIntelligenceBriefForSeed(seed);
    expect(brief).not.toBeNull();
    expect(brief!.healthScore.overallReadiness).toBeGreaterThan(0);
    expect(brief!.summary).toContain('Cupcakes by');
    expect(brief!.generatedMarkdown).toContain('Business Health Score');
  });
});
