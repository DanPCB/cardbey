/**
 * Foundation 3 Session 1 unit tests: prompt builder, parser, budget exceeded.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildOpportunityPrompt,
  parseOpportunitiesResponse,
  runOpportunityInference,
} from './opportunityInference.js';

// Mock LLM budget so checkLlmBudget returns false (budget exceeded)
vi.mock('../../lib/llm/llmBudget.js', () => ({
  checkAndReserveBudget: vi.fn().mockResolvedValue({ allowed: false }),
  isBudgetEnabled: vi.fn().mockReturnValue(true),
}));

describe('opportunityInference', () => {
  describe('buildOpportunityPrompt', () => {
    it('includes businessName, signalSummary, existing types in prompt', () => {
      const input = {
        storeId: 's1',
        storeContext: { businessName: 'Acme Cafe', businessType: 'cafe', storeType: 'retail' },
        windowDays: 30,
        signalSummary: '50 page views, 10 QR scans',
        existingOpportunityTypes: ['high_views_no_qr', 'low_traffic'],
      };
      const { full } = buildOpportunityPrompt(input);
      expect(full).toContain('Acme Cafe');
      expect(full).toContain('50 page views, 10 QR scans');
      expect(full).toContain('high_views_no_qr');
      expect(full).toContain('low_traffic');
      expect(full).toContain('30');
      expect(full).toMatch(/JSON array/);
      expect(full).not.toMatch(/```/);
    });

    it('instructs JSON only, no markdown fences', () => {
      const input = {
        storeId: 's1',
        storeContext: { businessName: 'X', businessType: 'y', storeType: 'z' },
        windowDays: 7,
        signalSummary: '',
        existingOpportunityTypes: [],
      };
      const { system } = buildOpportunityPrompt(input);
      expect(system).toMatch(/only.*JSON array/i);
      expect(system).toMatch(/no markdown|no explanation/i);
    });
  });

  describe('parseOpportunitiesResponse', () => {
    it('returns correct objects for valid JSON array', () => {
      const raw = JSON.stringify([
        {
          type: 'high_views_no_qr',
          title: 'Add QR to popular offer',
          description: 'Offer X has many views but no QR',
          suggestedIntentType: 'create_qr_for_offer',
          suggestedPayload: { offerId: 'o1' },
          confidence: 0.9,
          reasoning: 'Traffic is high',
        },
      ]);
      const { valid, dropped } = parseOpportunitiesResponse(raw);
      expect(valid).toHaveLength(1);
      expect(valid[0].type).toBe('high_views_no_qr');
      expect(valid[0].title).toBe('Add QR to popular offer');
      expect(valid[0].suggestedIntentType).toBe('create_qr_for_offer');
      expect(valid[0].confidence).toBe(0.9);
      expect(dropped).toBe(0);
    });

    it('strips markdown code fences before parsing', () => {
      const raw = '```json\n[{"type":"a","title":"T","suggestedIntentType":"create_offer"}]\n```';
      const { valid } = parseOpportunitiesResponse(raw);
      expect(valid).toHaveLength(1);
      expect(valid[0].type).toBe('a');
    });

    it('drops malformed items and counts them', () => {
      const raw = JSON.stringify([
        { type: 'ok', title: 'OK', suggestedIntentType: 'create_offer' },
        { type: 'missing_title', suggestedIntentType: 'x' },
        null,
        { type: 'x', title: 'Y', suggestedIntentType: 'z' },
      ]);
      const { valid, dropped } = parseOpportunitiesResponse(raw);
      expect(valid).toHaveLength(2);
      expect(valid[0].type).toBe('ok');
      expect(valid[1].type).toBe('x');
      expect(dropped).toBe(2);
    });

    it('returns empty valid for non-array JSON', () => {
      const { valid } = parseOpportunitiesResponse('{"type":"single"}');
      expect(valid).toHaveLength(0);
    });

    it('returns empty valid for invalid JSON', () => {
      const { valid } = parseOpportunitiesResponse('not json');
      expect(valid).toHaveLength(0);
    });
  });

  describe('budget exceeded', () => {
    it('returns { skipped: true, reason: "budget_exceeded" } when LLM budget is exceeded', async () => {
      const prisma = {
        business: { findUnique: vi.fn().mockResolvedValue({ id: 's1', name: 'Store', type: 'cafe', slug: 'store' }) },
        intentOpportunity: { findMany: vi.fn().mockResolvedValue([]) },
      };

      const result = await runOpportunityInference(
        { entryPoint: 'opportunity_inference', request: { storeId: 's1' } },
        { prisma }
      );

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('budget_exceeded');
    });
  });
});
