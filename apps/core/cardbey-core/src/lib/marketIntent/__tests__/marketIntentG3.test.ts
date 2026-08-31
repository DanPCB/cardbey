import { describe, it, expect } from 'vitest';
import { normalizeMarketSignal } from '../normalizeMarketSignal.js';
import { buildMarketIntentAnalysis } from '../buildMarketIntentAnalysis.js';
import { mockLlmResponseForText } from './mockMarketIntentLlm.js';
import { parseMarketIntentLlmResponse } from '../marketIntentSchema.js';
import { processMarketSignalG2 } from '../processMarketSignalG2.js';
import { processMarketSignalG3FromG2 } from '../processMarketSignalG3.js';
import { assessMarketOpportunity } from '../assessMarketOpportunity.js';
import type { EntityCandidate, MarketEntityResearch } from '../entityTypes.js';
import type { ResolveBusinessEntityFn } from '../resolveMarketEntity.js';
import type { RunMarketResearchFn } from '../runMarketEntityResearch.js';

function buildG1FromText(rawText: string, overrides: Record<string, unknown> = {}) {
  const signal = normalizeMarketSignal({
    rawText,
    sourceType: 'social_post_copy',
    signalId: (overrides.signalId as string) ?? `g3-${rawText.slice(0, 12)}`,
    sourceUrl: (overrides.sourceUrl as string) ?? null,
    metadata: (overrides.metadata as Record<string, unknown>) ?? {},
    ...overrides,
  });
  const extracted = parseMarketIntentLlmResponse(JSON.stringify(mockLlmResponseForText(rawText)));
  const analysis = buildMarketIntentAnalysis(signal, extracted, 'llm');
  if (overrides.businessHint) analysis.businessHint = overrides.businessHint as string;
  return { signal, analysis };
}

function mockResolver(candidates: EntityCandidate[]): ResolveBusinessEntityFn {
  return async () => ({
    candidates,
    selectedCandidate: candidates[0] ?? null,
    confidence: candidates[0]?.confidence ?? 0,
    requiresOwnerConfirmation: candidates.length !== 1,
    resolutionNotes: ['mock'],
  });
}

const manufacturerResearch: RunMarketResearchFn = async (input) => ({
  researchRan: true,
  fallbackToGenerated: false,
  ownerReviewRequired: false,
  confidence: 0.82,
  facts: {
    businessName: { value: input.businessName, confidence: 0.9, sourceType: 'official_website' },
    category: { value: 'manufacturer', confidence: 0.85, sourceType: 'official_website' },
    description: { value: 'Manufactures sustainable food packaging in Vietnam.', confidence: 0.8, sourceType: 'official_website' },
    website: { value: input.website, confidence: 0.95, sourceType: 'official_website' },
    address: { value: 'Ho Chi Minh City, Vietnam', confidence: 0.75, sourceType: 'google_business' },
  },
  extractedItems: [{ name: 'Sustainable food packaging', confidence: 0.85, sourceType: 'official_website' }],
  sourcesUsed: [],
  sourcesPendingConfirmation: [],
  logs: [],
});

async function runG2G3(
  rawText: string,
  opts: {
    businessHint?: string;
    sourceUrl?: string;
    resolver?: EntityCandidate[];
    research?: RunMarketResearchFn;
  } = {},
) {
  const { signal, analysis } = buildG1FromText(rawText, {
    sourceUrl: opts.sourceUrl ?? null,
    businessHint: opts.businessHint,
  });
  if (opts.businessHint) analysis.businessHint = opts.businessHint;

  const g2 = await processMarketSignalG2(signal, analysis, {
    resolveBusinessEntity: mockResolver(
      opts.resolver ?? [
        {
          entityId: 'default',
          name: opts.businessHint ?? 'Test Business',
          confidence: 0.85,
          matchReasons: [],
          source: 'mock',
        },
      ],
    ),
    runResearch: opts.research ?? manufacturerResearch,
    skipNetwork: true,
  });
  const g3 = processMarketSignalG3FromG2(signal, analysis, g2);
  return { signal, analysis, g2, g3 };
}

describe('marketIntent G3 — scenario A: VN manufacturer', () => {
  it('produces meaningful fit with capability matches, no distributor fabrication', async () => {
    const { g3 } = await runG2G3(
      'Chúng tôi là nhà sản xuất bao bì thực phẩm bền vững tại Việt Nam và đang tìm nhà phân phối tại Australia.',
      {
        businessHint: 'EcoPack Vietnam',
        resolver: [
          {
            entityId: 'e1',
            name: 'EcoPack Vietnam',
            website: 'https://ecopack-vn.example.com',
            location: 'Vietnam',
            confidence: 0.88,
            matchReasons: ['name-exact'],
            source: 'google_places',
          },
        ],
      },
    );

    expect(['HIGH_FIT', 'MEDIUM_FIT']).toContain(g3.opportunity.overallFitBand);
    expect(g3.opportunity.primaryMatches.length).toBeGreaterThan(0);
    const ids = g3.capabilityMatches.map((m) => m.capabilityId);
    expect(ids).toContain('market_research');
    expect(ids.some((id) => ['create_store', 'structured_store_build'].includes(id))).toBe(true);
    expect(
      g3.opportunity.unavailableDesiredCapabilities.some((u) =>
        /distributor matching/i.test(u.need),
      ),
    ).toBe(true);
    expect(g3.opportunity.disqualifiers.some((d) => /NOT_A_CARDBEY/.test(d))).toBe(false);
    expect(g3.outcome).toBe('READY');
  });
});

describe('marketIntent G3 — scenario B: spa chain partners', () => {
  it('evaluates partner expansion with honest limitations', async () => {
    const { g3 } = await runG2G3(
      'Our wellness spa chain is inviting franchise and operating partners to expand nationally across Australia.',
      {
        businessHint: 'Wellness Spa Chain',
        resolver: [
          {
            entityId: 'spa1',
            name: 'Wellness Spa Chain',
            location: 'Australia',
            confidence: 0.8,
            matchReasons: ['name-partial'],
            source: 'google_places',
          },
        ],
        research: async (input) => ({
          ...(await manufacturerResearch(input)),
          facts: {
            businessName: { value: input.businessName, confidence: 0.9, sourceType: 'google_business' },
            category: { value: 'spa', confidence: 0.85, sourceType: 'google_business' },
          },
          extractedItems: [{ name: 'Massage therapy', confidence: 0.8, sourceType: 'google_business' }],
        }),
      },
    );

    expect(g3.opportunity.overallScore).toBeGreaterThan(30);
    expect(g3.capabilityMatches.length).toBeGreaterThan(0);
    expect(
      g3.opportunity.unavailableDesiredCapabilities.some((u) =>
        /partner|distributor/i.test(u.need),
      ),
    ).toBe(true);
  });
});

describe('marketIntent G3 — scenario C: used vehicle (mandatory)', () => {
  it('valid commercial intent but NOT Cardbey opportunity', async () => {
    const { analysis, g2, g3 } = await runG2G3('Selling my used Toyota Camry 2018, $5,500, low kms.');

    expect(analysis.classification).toBe('COMMERCIAL');
    expect(g2.resolvedEntity.entityKind).toBe('PERSON');
    expect(['LOW_FIT', 'NOT_A_CARDBEY_OPPORTUNITY']).toContain(g3.opportunity.overallFitBand);
    expect(
      g3.opportunity.disqualifiers.some((d) => /consumer|NOT_A_CARDBEY|outside Cardbey/i.test(d)),
    ).toBe(true);
    expect(['NOT_A_CARDBEY_OPPORTUNITY', 'NO_RELEVANT_CAPABILITY']).toContain(g3.outcome);
  });
});

describe('marketIntent G3 — scenario D: cleaning company customers', () => {
  it('matches real growth capabilities without promising direct customers', async () => {
    const rawText =
      'We need more customers for our cleaning company in Melbourne. Professional office cleaning services.';
    const { signal, analysis } = buildG1FromText(rawText);
    analysis.businessHint = 'Melbourne Cleaning Co';
    analysis.intents.primary = 'PROMOTE';
    analysis.wants.push({
      type: 'CUSTOMER',
      label: 'more customers',
      confidence: 0.9,
      basis: 'EXPLICIT',
      evidence: [],
    });

    const g2 = await processMarketSignalG2(signal, analysis, {
      resolveBusinessEntity: mockResolver([
        {
          entityId: 'clean1',
          name: 'Melbourne Cleaning Co',
          location: 'Melbourne, Australia',
          confidence: 0.85,
          matchReasons: ['name-exact'],
          source: 'google_places',
        },
      ]),
      runResearch: async (input) => ({
        ...(await manufacturerResearch(input)),
        facts: {
          businessName: { value: input.businessName, confidence: 0.9, sourceType: 'google_business' },
          category: { value: 'cleaning services', confidence: 0.85, sourceType: 'google_business' },
          address: { value: 'Melbourne, Australia', confidence: 0.8, sourceType: 'google_business' },
        },
      }),
      skipNetwork: true,
    });

    const g3 = processMarketSignalG3FromG2(signal, analysis, g2);
    expect(['HIGH_FIT', 'MEDIUM_FIT']).toContain(g3.opportunity.overallFitBand);
    const ids = g3.capabilityMatches.map((m) => m.capabilityId);
    expect(ids.some((id) => ['create_promotion', 'market_research', 'create_store', 'publish_to_social'].includes(id))).toBe(true);
    expect(
      g3.opportunity.unavailableDesiredCapabilities.some((u) =>
        /customer delivery|direct customer/i.test(u.need),
      ),
    ).toBe(true);
  });
});

describe('marketIntent G3 — scenario E: weak evidence', () => {
  it('reduces fit when entity ambiguous', async () => {
    const { signal, analysis } = buildG1FromText('Looking for partners for ABC.');
    analysis.businessHint = 'ABC';

    const g2 = await processMarketSignalG2(signal, analysis, {
      resolveBusinessEntity: mockResolver([
        { entityId: 'c1', name: 'ABC Logistics', confidence: 0.6, matchReasons: [], source: 'places' },
        { entityId: 'c2', name: 'ABC Packaging', confidence: 0.58, matchReasons: [], source: 'places' },
      ]),
      skipNetwork: true,
    });

    const g3 = processMarketSignalG3FromG2(signal, analysis, g2);
    expect(['INSUFFICIENT_EVIDENCE', 'LOW_FIT', 'MEDIUM_FIT']).toContain(g3.opportunity.overallFitBand);
    expect(g3.opportunity.disqualifiers.some((d) => /ambiguous/i.test(d))).toBe(true);
  });
});

describe('marketIntent G3 — non-commercial', () => {
  it('returns NOT_APPLICABLE', async () => {
    const { signal, analysis } = buildG1FromText('Happy birthday to my sister!');
    const g2 = await processMarketSignalG2(signal, analysis, { skipPlacesLookup: true });
    const g3 = processMarketSignalG3FromG2(signal, analysis, g2);
    expect(g3.opportunity.overallFitBand).toBe('NOT_APPLICABLE');
    expect(g3.outcome).toBe('NOT_APPLICABLE');
  });
});

describe('marketIntent G3 — provenance and determinism', () => {
  it('preserves evidence chain and stable capability IDs', async () => {
    const { signal, analysis } = buildG1FromText(
      'EcoPack Vietnam seeking Australian distributors for sustainable packaging.',
      { businessHint: 'EcoPack Vietnam', sourceUrl: 'https://ecopack-vn.example.com' },
    );
    analysis.businessHint = 'EcoPack Vietnam';

    const resolved = {
      signalId: signal.signalId,
      resolvedEntityRef: 'mktent_test123',
      entityKind: 'BUSINESS' as const,
      resolutionStatus: 'RESOLVED' as const,
      confidence: 0.9,
      canonicalName: 'EcoPack Vietnam',
      website: 'https://ecopack-vn.example.com',
      domains: ['ecopack-vn.example.com'],
      socialProfiles: [],
      location: 'Vietnam',
      externalIdentifiers: [],
      evidence: [{ statement: 'test', basis: 'FACT' as const, confidence: 0.9 }],
      candidateEntities: [],
      resolutionNotes: [],
    };

    const research: MarketEntityResearch = {
      signalId: signal.signalId,
      resolvedEntityRef: resolved.resolvedEntityRef,
      businessIdentity: 'EcoPack Vietnam',
      offerings: [{ name: 'Packaging', basis: 'FACT', confidence: 0.8, evidence: [] }],
      capabilities: ['manufacturing'],
      geographies: ['Vietnam'],
      customerSegments: [],
      digitalPresence: { website: 'https://ecopack-vn.example.com', socialProfiles: [] },
      publicContacts: [],
      evidence: [],
      confidence: 0.82,
      researchStatus: 'READY',
      limitations: [],
      researchedAt: new Date().toISOString(),
    };

    const opp1 = assessMarketOpportunity({
      signal,
      analysis,
      resolved,
      research,
      g1Evidence: analysis.classificationEvidence,
    });
    const opp2 = assessMarketOpportunity({
      signal,
      analysis,
      resolved,
      research,
      g1Evidence: analysis.classificationEvidence,
    });

    expect(opp1.overallScore).toBe(opp2.overallScore);
    expect(opp1.primaryMatches.map((m) => m.capabilityId)).toEqual(
      opp2.primaryMatches.map((m) => m.capabilityId),
    );
    expect(opp1.factors.length).toBe(8);
    expect(opp1.assessmentEvidence.some((e) => e.source === 'g1')).toBe(true);
  });
});

describe('marketIntent G3 — capability availability', () => {
  it('does not recommend launch_campaign as DIRECT_MATCH when stubbed', async () => {
    const { g3 } = await runG2G3(
      'We need more customers for our bakery in Melbourne.',
      {
        businessHint: 'Melbourne Bakery',
        resolver: [
          {
            entityId: 'b1',
            name: 'Melbourne Bakery',
            location: 'Melbourne',
            confidence: 0.85,
            matchReasons: [],
            source: 'places',
          },
        ],
      },
    );

    const launch = g3.capabilityMatches.find((m) => m.capabilityId === 'launch_campaign');
    if (launch) {
      expect(launch.fitLevel).not.toBe('DIRECT_MATCH');
      expect(launch.availability).toBe('STUBBED');
    }
  });
});
