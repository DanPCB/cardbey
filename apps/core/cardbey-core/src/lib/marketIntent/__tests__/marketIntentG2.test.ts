import { describe, it, expect } from 'vitest';
import { normalizeMarketSignal } from '../normalizeMarketSignal.js';
import { buildMarketIntentAnalysis } from '../buildMarketIntentAnalysis.js';
import { mockLlmResponseForText } from './mockMarketIntentLlm.js';
import { parseMarketIntentLlmResponse } from '../marketIntentSchema.js';
import { processMarketSignalG2 } from '../processMarketSignalG2.js';
import { inferMarketEntityKind } from '../inferMarketEntityKind.js';
import { extractResolutionHints } from '../extractResolutionHints.js';
import type { EntityCandidate } from '../entityTypes.js';
import type { ResolveBusinessEntityFn } from '../resolveMarketEntity.js';
import type { RunMarketResearchFn } from '../runMarketEntityResearch.js';

function buildG1FromText(rawText: string, overrides: Record<string, unknown> = {}) {
  const signal = normalizeMarketSignal({
    rawText,
    sourceType: 'social_post_copy',
    signalId: (overrides.signalId as string) ?? `test-${rawText.slice(0, 12)}`,
    sourceUrl: (overrides.sourceUrl as string) ?? null,
    metadata: (overrides.metadata as Record<string, unknown>) ?? {},
    ...overrides,
  });
  const extracted = parseMarketIntentLlmResponse(JSON.stringify(mockLlmResponseForText(rawText)));
  const analysis = buildMarketIntentAnalysis(signal, extracted, 'llm');
  return { signal, analysis };
}

function mockResolver(candidates: EntityCandidate[]): ResolveBusinessEntityFn {
  return async () => ({
    candidates,
    selectedCandidate: candidates[0] ?? null,
    confidence: candidates[0]?.confidence ?? 0,
    requiresOwnerConfirmation: candidates.length !== 1,
    resolutionNotes: ['mock resolver'],
  });
}

const mockResearchResult: RunMarketResearchFn = async (input) => ({
  researchRan: true,
  fallbackToGenerated: false,
  ownerReviewRequired: false,
  confidence: 0.82,
  facts: {
    businessName: { value: input.businessName, confidence: 0.9, sourceType: 'official_website' },
    category: { value: 'manufacturer', confidence: 0.85, sourceType: 'official_website' },
    description: {
      value: 'Manufactures sustainable food packaging in Vietnam.',
      confidence: 0.8,
      sourceType: 'official_website',
    },
    website: { value: input.website, confidence: 0.95, sourceType: 'official_website' },
    address: { value: 'Ho Chi Minh City, Vietnam', confidence: 0.75, sourceType: 'google_business' },
  },
  businessProfile: { semanticType: 'manufacturer' },
  extractedItems: [
    {
      name: 'Sustainable food packaging',
      category: 'packaging',
      confidence: 0.85,
      sourceType: 'official_website',
    },
  ],
  sourcesUsed: [],
  sourcesPendingConfirmation: [],
  logs: [],
});

describe('marketIntent G2 — entity kind inference', () => {
  it('classifies used vehicle as PERSON', () => {
    const { signal, analysis } = buildG1FromText('Selling my used Toyota Camry 2018, $5,500');
    expect(inferMarketEntityKind(signal, analysis)).toBe('PERSON');
  });

  it('classifies co-founder signal as PROJECT', () => {
    const { signal, analysis } = buildG1FromText(
      'Looking for a technical co-founder for MyFit — fitness app',
    );
    expect(inferMarketEntityKind(signal, analysis)).toBe('PROJECT');
  });

  it('classifies manufacturer as BUSINESS', () => {
    const { signal, analysis } = buildG1FromText(
      'Chúng tôi là nhà sản xuất bao bì thực phẩm bền vững tại Việt Nam và đang tìm nhà phân phối tại Australia.',
    );
    expect(inferMarketEntityKind(signal, analysis)).toBe('BUSINESS');
  });
});

describe('marketIntent G2 — resolution hints', () => {
  it('does not treat Facebook URL as business website', () => {
    const { signal, analysis } = buildG1FromText('Spa chain seeking partners', {
      sourceUrl: 'https://www.facebook.com/spachain/posts/123',
      businessHint: 'Wellness Spa Chain',
    });
    analysis.businessHint = 'Wellness Spa Chain';
    const hints = extractResolutionHints(signal, analysis);
    expect(hints.websiteHint).toBeNull();
    expect(hints.socialProfileUrl).toContain('facebook.com');
  });

  it('uses authoritative website from sourceUrl when not social', () => {
    const { signal, analysis } = buildG1FromText('EcoPack Vietnam distributors wanted', {
      sourceUrl: 'https://ecopack-vn.example.com/about',
    });
    analysis.businessHint = 'EcoPack Vietnam';
    const hints = extractResolutionHints(signal, analysis);
    expect(hints.websiteHint).toContain('ecopack-vn.example.com');
  });
});

describe('marketIntent G2 — scenario A', () => {
  it('resolves and researches Vietnamese manufacturer', async () => {
    const { signal, analysis } = buildG1FromText(
      'Chúng tôi là nhà sản xuất bao bì thực phẩm bền vững tại Việt Nam và đang tìm nhà phân phối tại Australia.',
    );
    analysis.businessHint = 'EcoPack Vietnam';

    const result = await processMarketSignalG2(signal, analysis, {
      skipPlacesLookup: false,
      resolveBusinessEntity: mockResolver([
        {
          entityId: 'place_ecopack',
          name: 'EcoPack Vietnam',
          website: 'https://ecopack-vn.example.com',
          location: 'Ho Chi Minh City, Vietnam',
          confidence: 0.88,
          matchReasons: ['name-exact'],
          source: 'google_places',
        },
      ]),
      runResearch: mockResearchResult,
      skipNetwork: true,
    });

    expect(result.outcome).toBe('RESEARCH_READY');
    expect(result.resolvedEntity.entityKind).toBe('BUSINESS');
    expect(result.resolvedEntity.resolutionStatus).toBe('RESOLVED');
    expect(result.research?.businessIdentity).toContain('EcoPack');
    expect(result.research?.offerings.length).toBeGreaterThan(0);
    expect(result.research?.geographies.some((g) => /vietnam/i.test(g))).toBe(true);
    expect(result.g1Evidence.length).toBeGreaterThan(0);
    expect((result as { cardbeyFit?: unknown }).cardbeyFit).toBeUndefined();
  });
});

describe('marketIntent G2 — scenario B', () => {
  it('researches spa chain with partner intent preserved', async () => {
    const { signal, analysis } = buildG1FromText(
      'Our wellness spa chain is inviting franchise and operating partners to expand nationally across Australia.',
    );
    analysis.businessHint = 'Wellness Spa Chain';

    const result = await processMarketSignalG2(signal, analysis, {
      resolveBusinessEntity: mockResolver([
        {
          entityId: 'place_spa',
          name: 'Wellness Spa Chain',
          location: 'Melbourne, Australia',
          confidence: 0.8,
          matchReasons: ['name-partial'],
          source: 'google_places',
        },
      ]),
      runResearch: async (input) => ({
        ...((await mockResearchResult(input)) as object),
        facts: {
          businessName: { value: input.businessName, confidence: 0.9, sourceType: 'google_business' },
          category: { value: 'spa', confidence: 0.85, sourceType: 'google_business' },
          address: { value: 'Australia', confidence: 0.7, sourceType: 'google_business' },
        },
        extractedItems: [
          { name: 'Massage therapy', confidence: 0.8, sourceType: 'google_business' },
          { name: 'Facial treatment', confidence: 0.8, sourceType: 'google_business' },
        ],
      }),
      skipNetwork: true,
    });

    expect(result.resolvedEntity.entityKind).toBe('BUSINESS');
    expect(analysis.intents.primary).toBe('PARTNER');
    expect(result.research?.researchStatus).toBe('READY');
  });
});

describe('marketIntent G2 — scenario C', () => {
  it('does not fabricate business for used car sale', async () => {
    const { signal, analysis } = buildG1FromText('Selling my used Toyota Camry 2018, $5,500, low kms.');

    const result = await processMarketSignalG2(signal, analysis, {
      skipPlacesLookup: true,
      runResearch: mockResearchResult,
    });

    expect(analysis.classification).toBe('COMMERCIAL');
    expect(result.resolvedEntity.entityKind).toBe('PERSON');
    expect(result.resolvedEntity.resolutionStatus).toBe('NOT_APPLICABLE');
    expect(result.outcome).toBe('RESEARCH_NOT_APPLICABLE');
    expect(result.research).toBeNull();
  });
});

describe('marketIntent G2 — scenario D', () => {
  it('stops on ambiguous ABC without deep research', async () => {
    const { signal, analysis } = buildG1FromText('Looking for partners for ABC.');
    analysis.businessHint = 'ABC';

    const result = await processMarketSignalG2(signal, analysis, {
      resolveBusinessEntity: mockResolver([
        {
          entityId: 'c1',
          name: 'ABC Logistics',
          confidence: 0.6,
          matchReasons: ['name-partial'],
          source: 'google_places',
        },
        {
          entityId: 'c2',
          name: 'ABC Packaging',
          confidence: 0.58,
          matchReasons: ['name-partial'],
          source: 'google_places',
        },
      ]),
      runResearch: mockResearchResult,
    });

    expect(result.resolvedEntity.resolutionStatus).toBe('AMBIGUOUS');
    expect(result.outcome).toBe('RESOLUTION_AMBIGUOUS');
    expect(result.research).toBeNull();
    expect(result.resolvedEntity.candidateEntities.length).toBe(2);
  });
});

describe('marketIntent G2 — scenario E', () => {
  it('researches business with explicit name and website', async () => {
    const { signal, analysis } = buildG1FromText(
      'EcoPack Vietnam is seeking Australian distributors for our sustainable packaging line.',
      {
        sourceUrl: 'https://ecopack-vn.example.com',
        metadata: { website: 'https://ecopack-vn.example.com' },
      },
    );
    analysis.businessHint = 'EcoPack Vietnam';

    const result = await processMarketSignalG2(signal, analysis, {
      resolveBusinessEntity: mockResolver([
        {
          entityId: 'web_ecopack',
          name: 'EcoPack Vietnam',
          website: 'https://ecopack-vn.example.com',
          confidence: 0.91,
          matchReasons: ['website_hint', 'name-exact'],
          source: 'website',
        },
      ]),
      runResearch: mockResearchResult,
      skipNetwork: true,
    });

    expect(result.resolvedEntity.resolutionStatus).toBe('RESOLVED');
    expect(result.outcome).toBe('RESEARCH_READY');
    expect(result.research?.researchStatus).toBe('READY');
    expect(result.research?.evidence.length).toBeGreaterThan(0);
    expect(result.resolvedEntity.resolvedEntityRef).toMatch(/^mktent_/);
  });
});

describe('marketIntent G2 — cost gating', () => {
  it('skips non-commercial G1', async () => {
    const { signal, analysis } = buildG1FromText('Happy birthday to my sister!');
    const result = await processMarketSignalG2(signal, analysis);
    expect(result.outcome).toBe('SKIPPED_NON_COMMERCIAL');
    expect(result.research).toBeNull();
  });

  it('skips ambiguous G1', async () => {
    const { signal, analysis } = buildG1FromText('Maybe interested in business stuff later, not sure yet.');
    const result = await processMarketSignalG2(signal, analysis);
    expect(result.outcome).toBe('SKIPPED_AMBIGUOUS_G1');
    expect(result.research).toBeNull();
  });

  it('handles land investment as PERSON without business research', async () => {
    const { signal, analysis } = buildG1FromText('Mời hợp tác đầu tư dự án bất động sản 600m2 tại Bình Dương.');
    const result = await processMarketSignalG2(signal, analysis, { skipPlacesLookup: true });
    expect(result.resolvedEntity.entityKind).toBe('PERSON');
    expect(result.outcome).toBe('RESEARCH_NOT_APPLICABLE');
  });
});

describe('marketIntent G2 — lineage', () => {
  it('preserves signalId through entity and research', async () => {
    const { signal, analysis } = buildG1FromText('EcoPack Vietnam seeking distributors', {
      signalId: 'lineage-test-001',
      sourceUrl: 'https://ecopack-vn.example.com',
    });
    analysis.businessHint = 'EcoPack Vietnam';

    const result = await processMarketSignalG2(signal, analysis, {
      resolveBusinessEntity: mockResolver([
        {
          entityId: 'e1',
          name: 'EcoPack Vietnam',
          website: 'https://ecopack-vn.example.com',
          confidence: 0.9,
          matchReasons: ['name-exact'],
          source: 'website',
        },
      ]),
      runResearch: mockResearchResult,
    });

    expect(result.signalId).toBe('lineage-test-001');
    expect(result.resolvedEntity.signalId).toBe('lineage-test-001');
    expect(result.research?.signalId).toBe('lineage-test-001');
    expect(result.research?.resolvedEntityRef).toBe(result.resolvedEntity.resolvedEntityRef);
  });
});
