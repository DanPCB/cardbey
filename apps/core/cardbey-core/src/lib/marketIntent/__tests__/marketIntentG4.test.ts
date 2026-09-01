import { describe, it, expect } from 'vitest';
import { normalizeMarketSignal } from '../normalizeMarketSignal.js';
import { buildMarketIntentAnalysis } from '../buildMarketIntentAnalysis.js';
import { mockLlmResponseForText } from './mockMarketIntentLlm.js';
import { parseMarketIntentLlmResponse } from '../marketIntentSchema.js';
import { processMarketSignalG2 } from '../processMarketSignalG2.js';
import { processMarketSignalG4FromG2 } from '../processMarketSignalG4.js';
import type { EntityCandidate } from '../entityTypes.js';
import type { ResolveBusinessEntityFn } from '../resolveMarketEntity.js';
import type { RunMarketResearchFn } from '../runMarketEntityResearch.js';

function buildG1FromText(rawText: string, overrides: Record<string, unknown> = {}) {
  const signal = normalizeMarketSignal({
    rawText,
    sourceType: 'social_post_copy',
    signalId: (overrides.signalId as string) ?? `g4-${rawText.slice(0, 12)}`,
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

async function runG2G4(
  rawText: string,
  opts: {
    businessHint?: string;
    resolver?: EntityCandidate[];
    research?: RunMarketResearchFn;
  } = {},
) {
  const { signal, analysis } = buildG1FromText(rawText, { businessHint: opts.businessHint });
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
  const g4 = processMarketSignalG4FromG2(signal, analysis, g2);
  return { signal, analysis, g2, g4 };
}

function hasBasis(statements: { basis: string }[], basis: string): boolean {
  return statements.some((s) => s.basis === basis);
}

describe('marketIntent G4 — scenario A: VN manufacturer', () => {
  it('produces opportunity brief and coherent solution with distributor limitation', async () => {
    const { g4 } = await runG2G4(
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

    expect(['BRIEF_READY', 'SOLUTION_READY', 'PREVIEW_READY']).toContain(g4.outcome);
    expect(g4.preparationLevel).toBeGreaterThanOrEqual(2);
    expect(g4.brief.knownFacts.length).toBeGreaterThan(0);
    expect(hasBasis(g4.brief.knownFacts, 'FACT')).toBe(true);
    expect(hasBasis(g4.brief.sections.proposedSolution, 'RECOMMENDATION')).toBe(true);
    expect(g4.brief.sections.limitations.some((l) => /distributor/i.test(l.statement))).toBe(true);
    expect(g4.solution).not.toBeNull();
    expect(g4.solution!.capabilityIds).toContain('market_research');
    expect(g4.solution!.sequence.length).toBeGreaterThanOrEqual(1);
    expect(g4.solution!.sequence.length).toBeLessThanOrEqual(2);
    expect(g4.solution!.unavailableDesired.some((u) => /distributor/i.test(u.need))).toBe(true);
    expect(g4.brief.opportunityCard.canPrepare.length).toBeGreaterThan(0);
  });
});

describe('marketIntent G4 — scenario B: spa expansion', () => {
  it('produces partner brief and solution with partner matching limitation', async () => {
    const { g4 } = await runG2G4(
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

    expect(g4.brief.sections.intent.some((s) => /partner|franchise/i.test(s.statement))).toBe(true);
    expect(g4.solution).not.toBeNull();
    expect(g4.solution!.capabilityIds.length).toBeGreaterThan(0);
    expect(
      g4.brief.sections.limitations.some((l) => /partner|franchise/i.test(l.statement)),
    ).toBe(true);
    expect(g4.solution!.components.every((c) => c.mode !== 'UNAVAILABLE')).toBe(true);
  });
});

describe('marketIntent G4 — scenario C: cleaning company', () => {
  it('produces customer-growth brief without guaranteed customer promise', async () => {
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
        },
      }),
      skipNetwork: true,
    });

    const g4 = processMarketSignalG4FromG2(signal, analysis, g2);
    expect(g4.solution).not.toBeNull();
    const ids = g4.solution!.capabilityIds;
    expect(ids.some((id) => ['create_promotion', 'market_research', 'create_store'].includes(id))).toBe(true);
    expect(
      g4.brief.sections.limitations.some((l) => /customer delivery|guaranteed/i.test(l.statement)),
    ).toBe(true);
    expect(
      g4.brief.sections.proposedSolution.every((s) => !/will deliver customers/i.test(s.statement)),
    ).toBe(true);
  });
});

describe('marketIntent G4 — scenario D: used vehicle (mandatory)', () => {
  it('does not produce expensive solution preparation', async () => {
    const { g4 } = await runG2G4('Selling my used Toyota Camry 2018, $5,500, low kms.');

    expect(g4.preparationLevel).toBeLessThanOrEqual(1);
    expect(g4.solution).toBeNull();
    expect(['NO_SOLUTION_REQUIRED', 'BRIEF_READY']).toContain(g4.outcome);
    expect(g4.brief.sections.limitations.length).toBeGreaterThan(0);
    expect(g4.diagnostics.previewCount).toBe(0);
  });
});

describe('marketIntent G4 — scenario E: investor-seeking', () => {
  it('produces conservative solution without investor matching invention', async () => {
    const { g4 } = await runG2G4(
      'Seeking investors for our real estate development project in Binh Duong, 600m2.',
    );

    expect(g4.brief.knownFacts.length).toBeGreaterThan(0);
    expect(
      g4.brief.sections.limitations.some((l) => /investor/i.test(l.statement)),
    ).toBe(true);
    if (g4.solution) {
      expect(g4.solution.capabilityIds).not.toContain('investor_matching');
      expect(g4.solution.unavailableDesired.some((u) => /investor/i.test(u.need))).toBe(true);
    }
  });
});

describe('marketIntent G4 — scenario F: ambiguous entity', () => {
  it('blocks expensive preparation on weak evidence', async () => {
    const { signal, analysis } = buildG1FromText('Looking for partners for ABC.');
    analysis.businessHint = 'ABC';

    const g2 = await processMarketSignalG2(signal, analysis, {
      resolveBusinessEntity: mockResolver([
        { entityId: 'c1', name: 'ABC Logistics', confidence: 0.6, matchReasons: [], source: 'places' },
        { entityId: 'c2', name: 'ABC Packaging', confidence: 0.58, matchReasons: [], source: 'places' },
      ]),
      skipNetwork: true,
    });

    const g4 = processMarketSignalG4FromG2(signal, analysis, g2);
    expect(g4.preparationLevel).toBeLessThanOrEqual(1);
    expect(g4.diagnostics.previewCount).toBe(0);
    expect(g4.brief.unknowns.length).toBeGreaterThan(0);
  });
});

describe('marketIntent G4 — scenario G: non-commercial', () => {
  it('returns NOT_APPLICABLE', async () => {
    const { g4 } = await runG2G4('Happy birthday to my sister!');
    expect(g4.outcome).toBe('NOT_APPLICABLE');
    expect(g4.solution).toBeNull();
    expect(g4.preparationLevel).toBe(0);
  });
});

describe('marketIntent G4 — fact/inference separation and sequencing', () => {
  it('preserves basis types and ordered solution sequence', async () => {
    const { g4 } = await runG2G4(
      'EcoPack Vietnam seeking Australian distributors for sustainable packaging.',
      { businessHint: 'EcoPack Vietnam' },
    );

    expect(hasBasis(g4.brief.knownFacts, 'FACT')).toBe(true);
    expect(hasBasis(g4.brief.inferences, 'INFERENCE')).toBe(true);
    expect(g4.solution).not.toBeNull();

    const seq = g4.solution!.sequence;
    const mrIdx = seq.indexOf('market_research');
    const storeIdx = seq.findIndex((id) => id === 'create_store' || id === 'structured_store_build');
    if (mrIdx >= 0 && storeIdx >= 0) {
      expect(mrIdx).toBeLessThan(storeIdx);
    }

    expect(g4.solution!.components.every((c) => c.capabilityId.length > 0)).toBe(true);
    expect(g4.provenanceChain.g3FactorCount).toBeGreaterThan(0);
  });
});

describe('marketIntent G4 — no side effects', () => {
  it('previews are in-memory only with explicit limitations', async () => {
    const { g4 } = await runG2G4(
      'Chúng tôi là nhà sản xuất bao bì thực phẩm bền vững tại Việt Nam và đang tìm nhà phân phối tại Australia.',
      { businessHint: 'EcoPack Vietnam' },
    );

    if (g4.solution?.previews.length) {
      for (const preview of g4.solution.previews) {
        expect(preview.limitations.some((l) => /not persisted|no.*publish|concept only|outline only/i.test(l))).toBe(true);
      }
    }
    expect(g4.brief.sections.nextAction.some((s) => /G5|human/i.test(s.statement))).toBe(true);
  });
});

describe('marketIntent G4 — launch_campaign stub', () => {
  it('does not include stubbed campaign as primary executable component', async () => {
    const { g4 } = await runG2G4(
      'We need more customers for our bakery in Melbourne.',
      { businessHint: 'Melbourne Bakery' },
    );

    const launch = g4.solution?.components.find((c) => c.capabilityId === 'launch_campaign');
    if (launch) {
      expect(launch.mode).not.toBe('PREPARE');
      expect(launch.role).not.toBe('primary');
    }
  });
});
