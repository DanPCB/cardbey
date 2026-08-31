import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeMarketSignal } from '../normalizeMarketSignal.js';
import { buildMarketIntentAnalysis } from '../buildMarketIntentAnalysis.js';
import { mockLlmResponseForText } from './mockMarketIntentLlm.js';
import { parseMarketIntentLlmResponse } from '../marketIntentSchema.js';
import { processMarketSignalG2 } from '../processMarketSignalG2.js';
import { processMarketSignalG5FromG2 } from '../processMarketSignalG5.js';
import { resetConnectionStoreForTests } from '../connectionStore.js';
import {
  approveConnection,
  executeApprovedConnection,
  createRecordingConnectionAdapter,
} from '../executeApprovedConnection.js';
import { buildMessageVersionHash } from '../connectionGovernance.js';
import type { EntityCandidate } from '../entityTypes.js';
import type { ResolveBusinessEntityFn } from '../resolveMarketEntity.js';
import type { RunMarketResearchFn } from '../runMarketEntityResearch.js';

function buildG1FromText(rawText: string, overrides: Record<string, unknown> = {}) {
  const signal = normalizeMarketSignal({
    rawText,
    sourceType: (overrides.sourceType as string) ?? 'social_post_copy',
    signalId: (overrides.signalId as string) ?? `g5-${rawText.slice(0, 12)}`,
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

const researchWithEmail: RunMarketResearchFn = async (input) => {
  const base = await manufacturerResearch(input);
  return {
    ...base,
    publicContacts: [
      { type: 'email', value: 'contact@ecopack-vn.example.com', basis: 'FACT' as const, confidence: 0.88 },
    ],
  };
};

async function runG2G5(
  rawText: string,
  opts: {
    businessHint?: string;
    resolver?: EntityCandidate[];
    research?: RunMarketResearchFn;
    sourceType?: string;
    g5Options?: Record<string, unknown>;
  } = {},
) {
  const g1Overrides: Record<string, unknown> = {};
  if (opts.businessHint) g1Overrides.businessHint = opts.businessHint;
  if (opts.sourceType) g1Overrides.sourceType = opts.sourceType;

  const { signal, analysis } = buildG1FromText(rawText, g1Overrides);
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

  const g5 = processMarketSignalG5FromG2(signal, analysis, g2, opts.g5Options ?? {});
  return { signal, analysis, g2, g5 };
}

beforeEach(() => {
  resetConnectionStoreForTests();
});

describe('marketIntent G5 — scenario A: VN manufacturer', () => {
  it('prepares value-first plan with distributor limitation and tracked destination', async () => {
    const { g5 } = await runG2G5(
      'Chúng tôi là nhà sản xuất bao bì thực phẩm bền vững tại Việt Nam và đang tìm nhà phân phối tại Australia.',
      {
        businessHint: 'EcoPack Vietnam',
        research: researchWithEmail,
        g5Options: { explicitEmail: 'contact@ecopack-vn.example.com', emailExecutionAvailable: true },
        resolver: [
          {
            entityId: 'e1',
            name: 'EcoPack Vietnam',
            confidence: 0.88,
            matchReasons: [],
            source: 'places',
          },
        ],
      },
    );

    expect(g5.connectionPlan).not.toBeNull();
    expect(g5.outcome).toBe('REVIEW_REQUIRED');
    expect(g5.connectionPlan!.trackedDestination?.url).toContain('cb_signal=');
    expect(g5.connectionPlan!.messageDraft?.body).toMatch(/prepared/i);
    expect(g5.connectionPlan!.messageDraft?.body).not.toMatch(/found distributors for you/i);
    expect(g5.connectionPlan!.limitations.some((l) => /distributor|approval/i.test(l))).toBe(true);
    expect(g5.connectionPlan!.approvalRequired).toBe(true);
    expect(g5.connectionPlan!.governanceStatus).toBe('READY_FOR_REVIEW');
  });
});

describe('marketIntent G5 — scenario B: spa expansion', () => {
  it('requires manual handoff for social-originated partner expansion', async () => {
    const { g5 } = await runG2G5(
      'Our wellness spa chain is inviting franchise and operating partners to expand nationally across Australia.',
      {
        businessHint: 'Wellness Spa Chain',
        sourceType: 'social_post_copy',
        resolver: [
          { entityId: 'spa1', name: 'Wellness Spa Chain', confidence: 0.8, matchReasons: [], source: 'places' },
        ],
        research: async (input) => ({
          ...(await manufacturerResearch(input)),
          facts: {
            businessName: { value: input.businessName, confidence: 0.9, sourceType: 'google_business' },
            category: { value: 'spa', confidence: 0.85, sourceType: 'google_business' },
            website: { value: 'https://wellness-spa.example.com', confidence: 0.8, sourceType: 'google_business' },
          },
          extractedItems: [{ name: 'Massage therapy', confidence: 0.8, sourceType: 'google_business' }],
        }),
      },
    );

    expect(g5.connectionPlan).not.toBeNull();
    expect(g5.connectionPlan!.executionMode).toBe('MANUAL_HANDOFF');
    expect(g5.connectionPlan!.recommendedChannel).toBe('ORIGINAL_SOCIAL_CONTEXT');
    expect(g5.connectionPlan!.limitations.some((l) => /manual|social|DM/i.test(l))).toBe(true);
  });
});

describe('marketIntent G5 — scenario C: cleaning business', () => {
  it('prepares customer-growth message without guaranteed customer promise', async () => {
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
        { entityId: 'c1', name: 'Melbourne Cleaning Co', confidence: 0.85, matchReasons: [], source: 'places' },
      ]),
      runResearch: async (input) => ({
        ...(await manufacturerResearch(input)),
        publicContacts: [
          { type: 'email', value: 'hello@melbourne-cleaning.example.com', basis: 'FACT', confidence: 0.9 },
        ],
      }),
      skipNetwork: true,
    });

    const g5 = processMarketSignalG5FromG2(signal, analysis, g2, {
      explicitEmail: 'hello@melbourne-cleaning.example.com',
      emailExecutionAvailable: true,
    });

    expect(g5.connectionPlan?.messageDraft?.body).not.toMatch(/will deliver customers|Cardbey will deliver/i);
    expect(
      g5.connectionPlan?.messageDraft?.limitations.some((l) => /customer delivery|guaranteed/i.test(l)) ||
        g5.connectionPlan?.limitations.some((l) => /customer delivery|guaranteed/i.test(l)),
    ).toBe(true);
  });
});

describe('marketIntent G5 — scenario D: used vehicle', () => {
  it('does not create outreach plan', async () => {
    const { g5 } = await runG2G5('Selling my used Toyota Camry 2018, $5,500, low kms.');
    expect(g5.connectionPlan).toBeNull();
    expect(g5.outcome).toBe('CONNECTION_NOT_RECOMMENDED');
  });
});

describe('marketIntent G5 — scenario E: investor-seeking', () => {
  it('retains investor limitation in message', async () => {
    const { g5 } = await runG2G5('Seeking investors for our real estate development project in Binh Duong.', {
      g5Options: { explicitEmail: 'dev@project.example.com' },
    });

    if (g5.connectionPlan?.messageDraft) {
      expect(g5.connectionPlan.messageDraft.body).not.toMatch(/investors waiting|found investors/i);
      expect(
        g5.connectionPlan.limitations.some((l) => /investor/i.test(l)) ||
          g5.connectionPlan.messageDraft.limitations.some((l) => /investor/i.test(l)),
      ).toBe(true);
    }
  });
});

describe('marketIntent G5 — scenario F: no reliable contact', () => {
  it('returns CONTACT_TARGET_UNAVAILABLE without invented email', async () => {
    const { g5 } = await runG2G5(
      'EcoPack Vietnam seeking Australian distributors for sustainable packaging.',
      { businessHint: 'EcoPack Vietnam', research: manufacturerResearch },
    );

    expect(g5.connectionPlan).toBeNull();
    expect(g5.outcome).toBe('CONTACT_TARGET_UNAVAILABLE');
  });
});

describe('marketIntent G5 — scenario G: message modified after approval', () => {
  it('blocks execution when message changes after approval', async () => {
    const { g5 } = await runG2G5(
      'Chúng tôi là nhà sản xuất bao bì thực phẩm bền vững tại Việt Nam và đang tìm nhà phân phối tại Australia.',
      {
        businessHint: 'EcoPack Vietnam',
        g5Options: { explicitEmail: 'contact@ecopack-vn.example.com', emailExecutionAvailable: true },
      },
    );

    const planId = g5.connectionPlan!.connectionPlanId;
    const approval = approveConnection({ connectionPlanId: planId, approvedBy: 'operator@test' });
    expect(approval.ok).toBe(true);

    const adapter = createRecordingConnectionAdapter();
    const result = await executeApprovedConnection({
      connectionPlanId: planId,
      executedBy: 'operator@test',
      adapter,
      messageOverride: 'Completely different message after approval',
    });

    expect(result.outcome).toBe('REAPPROVAL_REQUIRED');
    expect(adapter.getSent().length).toBe(0);
  });
});

describe('marketIntent G5 — scenario H: retry idempotency', () => {
  it('executes once and prevents duplicate on retry', async () => {
    const { g5 } = await runG2G5(
      'Chúng tôi là nhà sản xuất bao bì thực phẩm bền vững tại Việt Nam và đang tìm nhà phân phối tại Australia.',
      {
        businessHint: 'EcoPack Vietnam',
        g5Options: { explicitEmail: 'contact@ecopack-vn.example.com', emailExecutionAvailable: true },
      },
    );

    const planId = g5.connectionPlan!.connectionPlanId;
    approveConnection({ connectionPlanId: planId, approvedBy: 'operator@test' });

    const adapter = createRecordingConnectionAdapter();
    const first = await executeApprovedConnection({
      connectionPlanId: planId,
      executedBy: 'operator@test',
      adapter,
    });
    const second = await executeApprovedConnection({
      connectionPlanId: planId,
      executedBy: 'operator@test',
      adapter,
    });

    expect(first.outcome).toBe('EXECUTED');
    expect(second.outcome).toBe('DUPLICATE_EXECUTION_PREVENTED');
    expect(adapter.getSent().length).toBe(1);
  });
});

describe('marketIntent G5 — approval required before execution', () => {
  it('blocks execution without approval', async () => {
    const { g5 } = await runG2G5(
      'Chúng tôi là nhà sản xuất bao bì thực phẩm bền vững tại Việt Nam và đang tìm nhà phân phối tại Australia.',
      {
        g5Options: { explicitEmail: 'contact@ecopack-vn.example.com', emailExecutionAvailable: true },
      },
    );

    const result = await executeApprovedConnection({
      connectionPlanId: g5.connectionPlan!.connectionPlanId,
      executedBy: 'operator@test',
      adapter: createRecordingConnectionAdapter(),
    });

    expect(result.outcome).toBe('APPROVAL_REQUIRED');
  });
});

describe('marketIntent G5 — non-commercial', () => {
  it('returns NOT_APPLICABLE', async () => {
    const { g5 } = await runG2G5('Happy birthday to my sister!');
    expect(g5.outcome).toBe('NOT_APPLICABLE');
    expect(g5.connectionPlan).toBeNull();
  });
});

describe('marketIntent G5 — attribution lineage', () => {
  it('includes signalId in tracked destination attribution', async () => {
    const { signal, g5 } = await runG2G5(
      'Chúng tôi là nhà sản xuất bao bì thực phẩm bền vững tại Việt Nam và đang tìm nhà phân phối tại Australia.',
      { g5Options: { explicitEmail: 'contact@ecopack-vn.example.com' } },
    );

    expect(g5.connectionPlan?.trackedDestination?.attribution.signalId).toBe(signal.signalId);
    expect(g5.connectionPlan?.trackedDestination?.attribution.connectionPlanId).toBe(
      g5.connectionPlan?.connectionPlanId,
    );
    expect(g5.connectionPlan?.trackedDestination?.url).toContain('utm_source=market_intent');
  });
});

describe('marketIntent G5 — message version hash', () => {
  it('produces stable hash for same content', () => {
    const h1 = buildMessageVersionHash({ subject: 'Hi', body: 'Hello world' });
    const h2 = buildMessageVersionHash({ subject: 'Hi', body: 'Hello world' });
    const h3 = buildMessageVersionHash({ subject: 'Hi', body: 'Changed' });
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });
});
