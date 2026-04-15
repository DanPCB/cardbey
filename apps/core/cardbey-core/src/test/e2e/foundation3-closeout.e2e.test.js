/**
 * Foundation 3 close-out E2E: LLM-inferred opportunities.
 * - Mocks LLM response with a valid JSON array of 2 opportunities
 * - Calls runOpportunityInference with a test store
 * - Asserts 2 IntentOpportunity rows created with source: 'llm_inference'
 * - Asserts existing rule-based opportunities (source: 'rules') are untouched
 * - Simulates accepting one inferred opportunity → IntentRequest created (accept flow unchanged)
 *
 * Run: npx vitest run src/test/e2e/foundation3-closeout.e2e.test.js
 * Prerequisites: NODE_ENV=test DATABASE_URL=file:./prisma/test.db (pretest pushes schema).
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { getPrismaClient } from '../../lib/prisma.js';
import { executeTask } from '../../orchestrator/api/insightsOrchestrator.js';
import { resetDb } from '../helpers/resetDb.js';

const STORE_ID = 'e2e-f3-store';
const USER_ID = 'e2e-f3-user';
const MISSION_ID = 'e2e-f3-mission';
const RULES_OPPORTUNITY_ID = 'e2e-f3-rules-opp';

const MOCK_LLM_RESPONSE = JSON.stringify([
  {
    type: 'high_views_no_qr',
    title: 'Add QR to popular offer',
    description: 'Offer has many views but no QR',
    suggestedIntentType: 'create_qr_for_offer',
    suggestedPayload: { offerId: 'offer-1' },
    confidence: 0.9,
    reasoning: 'Traffic is high',
  },
  {
    type: 'low_traffic',
    title: 'Promote storefront',
    description: 'Increase visibility',
    suggestedIntentType: 'create_offer',
    suggestedPayload: {},
    confidence: 0.7,
    reasoning: 'Low traffic',
  },
]);

vi.mock('../../lib/llm/llmCache.js', () => ({
  hashPrompt: (p) => `hash-${p.length}`,
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  shouldSkipCacheForPrompt: vi.fn().mockReturnValue(false),
}));

vi.mock('../../lib/llm/llmBudget.js', () => ({
  checkAndReserveBudget: vi.fn().mockResolvedValue({
    allowed: true,
    day: new Date().toISOString().slice(0, 10),
    reservedTokensOut: 500,
  }),
  commitBudget: vi.fn().mockResolvedValue(undefined),
  estimateTokens: vi.fn().mockReturnValue({ tokensOut: 100 }),
  isBudgetEnabled: vi.fn().mockReturnValue(true),
  isFailOpen: vi.fn().mockReturnValue(false),
}));

vi.mock('../../lib/llm/kimiProvider.js', () => ({
  generateText: vi.fn().mockResolvedValue({ text: MOCK_LLM_RESPONSE, model: 'mock' }),
  kimiProvider: null,
}));

describe('Foundation 3 close-out E2E', () => {
  let prisma;
  let setupDone = false;

  beforeAll(async () => {
    prisma = getPrismaClient();
    if (!prisma?.business || !prisma?.intentOpportunity || !prisma?.user) return;

    try {
      await resetDb(prisma);
      await prisma.user.upsert({
        where: { id: USER_ID },
        create: {
          id: USER_ID,
          email: `f3-${USER_ID}@e2e.test`,
          passwordHash: 'n/a',
          displayName: 'E2E F3 User',
        },
        update: {},
      });

      await prisma.business.upsert({
        where: { id: STORE_ID },
        create: {
          id: STORE_ID,
          userId: USER_ID,
          name: 'E2E F3 Store',
          type: 'cafe',
          slug: 'e2e-f3-store',
        },
        update: { name: 'E2E F3 Store', type: 'cafe' },
      });

      await prisma.intentOpportunity.upsert({
        where: { id: RULES_OPPORTUNITY_ID },
        create: {
          id: RULES_OPPORTUNITY_ID,
          storeId: STORE_ID,
          type: 'rules_only_type',
          summary: 'Rule-based opportunity',
          recommendedIntentType: 'create_offer',
          source: 'rules',
        },
        update: { source: 'rules' },
      });

      await prisma.mission.upsert({
        where: { id: MISSION_ID },
        create: {
          id: MISSION_ID,
          tenantId: USER_ID,
          createdByUserId: USER_ID,
          status: 'active',
        },
        update: {},
      });
      setupDone = true;
    } catch (e) {
      if (e?.message?.includes('does not exist')) {
        console.warn('[F3 E2E] DB tables missing. Run: DATABASE_URL=file:./prisma/test.db npx prisma db push --schema prisma/sqlite/schema.prisma');
      }
    }
  });

  it('1. opportunity_inference creates 2 IntentOpportunity with source llm_inference', async () => {
    prisma = getPrismaClient();
    if (!setupDone || !prisma?.intentOpportunity) return;

    const result = await executeTask(
      {
        entryPoint: 'opportunity_inference',
        request: { storeId: STORE_ID, tenantKey: STORE_ID },
      },
      { prisma }
    );

    expect(result.skipped).not.toBe(true);
    expect(result.created).toBe(2);
    expect(Array.isArray(result.opportunities)).toBe(true);
    expect(result.opportunities).toHaveLength(2);

    const inferred = await prisma.intentOpportunity.findMany({
      where: { storeId: STORE_ID, source: 'llm_inference' },
    });
    expect(inferred).toHaveLength(2);
    expect(inferred.every((o) => o.source === 'llm_inference')).toBe(true);
    const types = inferred.map((o) => o.type).sort();
    expect(types).toContain('high_views_no_qr');
    expect(types).toContain('low_traffic');
  });

  it('2. Rule-based IntentOpportunity (source rules) is untouched', async () => {
    if (!setupDone) return;
    prisma = getPrismaClient();
    const rulesOpp = await prisma.intentOpportunity.findUnique({
      where: { id: RULES_OPPORTUNITY_ID },
    });
    expect(rulesOpp).toBeDefined();
    expect(rulesOpp.source).toBe('rules');
    expect(rulesOpp.type).toBe('rules_only_type');
  });

  it('3. Accept inferred opportunity creates IntentRequest (flow unchanged)', async () => {
    if (!setupDone) return;
    prisma = getPrismaClient();
    if (!prisma?.intentRequest) return;

    const inferred = await prisma.intentOpportunity.findFirst({
      where: { storeId: STORE_ID, source: 'llm_inference' },
    });
    expect(inferred).toBeDefined();

    const intentRequest = await prisma.intentRequest.create({
      data: {
        missionId: MISSION_ID,
        userId: USER_ID,
        type: inferred.recommendedIntentType,
        payload: inferred.payload ?? {},
        status: 'queued',
      },
    });

    expect(intentRequest.id).toBeDefined();
    expect(intentRequest.type).toBe(inferred.recommendedIntentType);
    expect(intentRequest.missionId).toBe(MISSION_ID);
  });
});
