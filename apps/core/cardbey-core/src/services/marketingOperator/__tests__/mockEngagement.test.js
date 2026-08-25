import { describe, expect, it, beforeEach, vi } from 'vitest';

const state = { engagements: [], drafts: [] };

vi.mock('../repository.js', () => ({
  marketingRepo: {
    engagement: {
      create: async (data) => {
        const row = { id: `e_${state.engagements.length + 1}`, ...data };
        state.engagements.push(row);
        return row;
      },
      findFirst: async ({ where } = {}) =>
        state.engagements.find(
          (e) =>
            (!where?.provider || e.provider === where.provider) &&
            (!where?.externalId || e.externalId === where.externalId),
        ) || null,
      findUnique: async ({ where, include }) => {
        const row = state.engagements.find((e) => e.id === where.id);
        if (!row) return null;
        if (include?.responseDrafts) {
          return {
            ...row,
            responseDrafts: state.drafts.filter((d) => d.engagementId === row.id).reverse(),
          };
        }
        return row;
      },
      update: async ({ where, data }) => {
        const row = state.engagements.find((e) => e.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    responseDraft: {
      create: async (data) => {
        const row = { id: `d_${state.drafts.length + 1}`, ...data };
        state.drafts.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = state.drafts.find((d) => d.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
  },
}));

vi.mock('../audit.js', () => ({ appendMarketingAudit: async () => {} }));
vi.mock('../aiGeneration.js', () => ({
  generateEngagementResponse: async () => ({
    body: 'AI body',
    generationMeta: { mode: 'model' },
  }),
}));

import {
  injectMockEngagement,
  generateResponseDraft,
  mockSendResponse,
  sendResponse,
} from '../engagementService.js';

describe('marketingOperator/mock engagement', () => {
  beforeEach(() => {
    state.engagements = [];
    state.drafts = [];
    delete process.env.ENABLE_MARKETING_AI_GENERATION_V1;
    delete process.env.ENABLE_FACEBOOK_RESPONSE_SENDING_V1;
  });

  it('injects mock engagement types', async () => {
    const result = await injectMockEngagement({
      type: 'PRODUCT_QUESTION',
      campaignId: 'camp1',
      body: 'What is Cardbey?',
    });
    expect(result.ok).toBe(true);
    expect(result.engagement.provider).toBe('mock');
    expect(result.engagement.metadata.mock).toBe(true);
  });

  it('refuses prompt injection instructions', async () => {
    const inj = await injectMockEngagement({ type: 'PROMPT_INJECTION' });
    const draft = await generateResponseDraft(inj.engagement.id);
    expect(draft.refusedInjection).toBe(true);
    expect(draft.draft.body).not.toMatch(/api key/i);
  });

  it('mock-send marks SENT locally and never Meta', async () => {
    const inj = await injectMockEngagement({ type: 'HOW_TO_START' });
    await generateResponseDraft(inj.engagement.id);
    const sent = await mockSendResponse(inj.engagement.id);
    expect(sent.ok).toBe(true);
    expect(sent.mock).toBe(true);
    expect(sent.meta).toBe(false);
    expect(sent.draft.status).toBe('SENT');
    expect(sent.draft.metadata.mockSend).toBe(true);
  });

  it('live send remains blocked', async () => {
    const result = await sendResponse('e1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('LIVE_DISABLED');
  });
});
