import { describe, expect, it, beforeEach, vi } from 'vitest';

const generateMock = vi.fn();
const store = {
  engagements: [],
  drafts: [],
  conversions: [],
  campaigns: [],
  touches: [],
};

vi.mock('../../../lib/llm/llmGateway.ts', () => ({
  llmGateway: {
    generate: (...args) => generateMock(...args),
  },
}));

vi.mock('../../marketingOperator/repository.js', () => ({
  marketingRepo: {
    engagement: {
      findUnique: async ({ where, include } = {}) => {
        const row = store.engagements.find((e) => e.id === where.id);
        if (!row) return null;
        return {
          ...row,
          campaign: include?.campaign
            ? store.campaigns.find((c) => c.id === row.campaignId) || null
            : row.campaign,
          responseDrafts: include?.responseDrafts
            ? store.drafts.filter((d) => d.engagementId === row.id)
            : undefined,
        };
      },
      update: async ({ where, data }) => {
        const row = store.engagements.find((e) => e.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    responseDraft: {
      create: async (data) => {
        const row = { id: `d_${store.drafts.length + 1}`, ...data };
        store.drafts.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = store.drafts.find((d) => d.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    conversion: {
      create: async (data) => {
        const row = { id: `cv_${store.conversions.length + 1}`, ...data };
        store.conversions.push(row);
        return row;
      },
      findFirst: async ({ where } = {}) =>
        store.conversions.find((c) => c.dedupeKey && c.dedupeKey === where.dedupeKey) || null,
    },
    attributionTouch: {
      create: async (data) => {
        const row = { id: `t_${store.touches.length + 1}`, ...data };
        store.touches.push(row);
        return row;
      },
    },
    campaign: {
      findFirst: async ({ where } = {}) => {
        const or = where?.OR;
        if (or) {
          return store.campaigns.find((c) => or.some((q) => c.id === q.id || c.name === q.name)) || null;
        }
        return store.campaigns[0] || null;
      },
    },
  },
}));

vi.mock('../../marketingOperator/audit.js', () => ({ appendMarketingAudit: async () => {} }));

import { Features } from '../../../config/features.js';
import { CANONICAL_EVENTS, TARGET_TYPES } from '../constants.js';
import { classifyMarketingIntent } from '../intentClassifier.js';
import { resolveDestinationForIntent, resolveGlobalLiveAvailability } from '../destinationGuard.js';
import { buildSuggestedReply } from '../suggestedReply.js';
import {
  approveInboxReply,
  classifyInboxInteraction,
  confirmInboxIntent,
  generateInboxSuggestion,
  rejectInboxSuggestion,
} from '../inboxAssistService.js';
import { recordCanonicalEvent } from '../attributionSpine.js';

function seedEngagement(overrides = {}) {
  const row = {
    id: 'e1',
    campaignId: 'camp_sme',
    provider: 'facebook',
    channel: 'facebook',
    contentId: 'c1',
    postId: 'p1',
    body: 'How do I start a business with Cardbey?',
    status: 'NEW',
    metadata: {},
    ...overrides,
  };
  store.engagements = [row];
  return row;
}

describe('marketingOperations intent + handoff', () => {
  beforeEach(() => {
    store.engagements = [];
    store.drafts = [];
    store.conversions = [];
    store.touches = [];
    store.campaigns = [
      { id: 'camp_sme', name: 'SME', targetType: TARGET_TYPES.USER_ACQUISITION, metadata: {} },
      { id: 'camp_inv', name: 'Inv', targetType: TARGET_TYPES.INVESTOR_DISCOVERY, metadata: {} },
    ];
    generateMock.mockReset();
    process.env.ENABLE_MARKETING_OPERATOR_V1 = 'true';
    process.env.ENABLE_MARKETING_ATTRIBUTION_V1 = 'true';
    process.env.ENABLE_MARKETING_AI_GENERATION_V1 = 'false';
    process.env.ENABLE_FACEBOOK_LIVE_PUBLISHING_V1 = 'false';
    process.env.ENABLE_FACEBOOK_RESPONSE_SENDING_V1 = 'false';
    delete process.env.ENABLE_GLOBAL_LIVE_EOI_V1;
    delete process.env.GLOBAL_LIVE_EOI_OPEN;
  });

  it('classifies supported USER_ACQUISITION intents', async () => {
    const created = await classifyMarketingIntent({ text: 'I want to create a store' });
    expect(created.primaryIntent).toBe('CREATE_BUSINESS');
    const eoi = await classifyMarketingIntent({ text: 'How do I register interest for Global Live?' });
    expect(eoi.primaryIntent).toBe('GLOBAL_LIVE_EOI');
  });

  it('uses UNKNOWN on low-confidence text', async () => {
    const res = await classifyMarketingIntent({ text: 'asdf qwer' });
    expect(res.primaryIntent).toBe('UNKNOWN');
    expect(res.confidence).toBeLessThan(0.4);
  });

  it('lets human override win over the model', async () => {
    seedEngagement();
    await classifyInboxInteraction('e1', { actorId: 'admin' });
    const confirmed = await confirmInboxIntent('e1', { intent: 'SUPPORT' }, { actorId: 'admin' });
    expect(confirmed.interaction.intentConfirmed).toBe('SUPPORT');
    expect(confirmed.interaction.intentPrimary).toBe('SUPPORT');
  });

  it('generates Vietnamese suggested replies', async () => {
    seedEngagement({ body: 'Tôi muốn tạo cửa hàng trên Cardbey' });
    const suggestion = await generateInboxSuggestion('e1', {}, { actorId: 'admin' });
    expect(suggestion.suggestion.reply).toMatch(/tiếp tục tại đây/i);
    expect(suggestion.sendsExternally).toBe(false);
  });

  it('generates English suggested replies with a tracked link when destination exists', async () => {
    seedEngagement({ body: 'How do I start a business?' });
    const suggestion = await generateInboxSuggestion('e1');
    expect(suggestion.suggestion.reply).toMatch(/continue here/i);
    expect(suggestion.suggestion.handoffPreview.url).toContain('/for-business');
    expect(suggestion.suggestion.handoffPreview.issued).toBe(false);
    expect(store.conversions).toHaveLength(0);
  });

  it('does not fabricate a Global Live link when the destination is unavailable', async () => {
    expect(resolveGlobalLiveAvailability().available).toBe(false);
    const dest = resolveDestinationForIntent({ intent: 'GLOBAL_LIVE_EOI' });
    expect(dest.available).toBe(false);
    const reply = buildSuggestedReply({
      intent: 'GLOBAL_LIVE_EOI',
      language: 'en',
      destination: dest,
      interaction: { id: 'e1', campaignId: 'camp_sme', channel: 'facebook', provider: 'facebook' },
    });
    expect(reply.reply).toMatch(/preparing this pilot/i);
    expect(reply.handoffPreview).toBeNull();
  });

  it('allows a Global Live tracked destination when the public feature is open', async () => {
    process.env.ENABLE_GLOBAL_LIVE_EOI_V1 = 'true';
    process.env.GLOBAL_LIVE_EOI_OPEN = 'true';
    const dest = resolveDestinationForIntent({ intent: 'GLOBAL_LIVE_EOI' });
    expect(dest.available).toBe(true);
    expect(dest.path).toBe('/global-live');
    const reply = buildSuggestedReply({
      intent: 'GLOBAL_LIVE_EOI',
      language: 'en',
      destination: dest,
      interaction: { id: 'e1', campaignId: 'camp_sme', provider: 'facebook', channel: 'facebook' },
    });
    expect(reply.handoffPreview.url).toContain('/global-live');
    expect(reply.handoffPreview.url).toContain('campaignId=camp_sme');
  });

  it('writes CARDBEY_HANDOFF only after approve, not after reject', async () => {
    seedEngagement({ body: 'How do I start a business?' });
    await generateInboxSuggestion('e1');
    expect(store.conversions).toHaveLength(0);
    const approved = await approveInboxReply('e1', { actorId: 'admin' });
    expect(approved.sent).toBe(false);
    expect(approved.sendsExternally).toBe(false);
    expect(approved.interaction.status).toBe('REPLY_APPROVED');
    expect(store.conversions.some((c) => c.eventType === CANONICAL_EVENTS.CARDBEY_HANDOFF)).toBe(true);

    store.conversions = [];
    seedEngagement({ id: 'e2', body: 'How do I start a business?' });
    await generateInboxSuggestion('e2');
    await rejectInboxSuggestion('e2', { actorId: 'admin' });
    expect(store.conversions.some((c) => c.eventType === CANONICAL_EVENTS.CARDBEY_HANDOFF)).toBe(false);
  });

  it('keeps investor intent outside the SME lifecycle', async () => {
    seedEngagement({
      id: 'e_inv',
      campaignId: 'camp_inv',
      body: 'I am a VC looking to invest in Cardbey',
    });
    const classified = await classifyInboxInteraction('e_inv');
    expect(classified.interaction.intentPrimary).toBe('INVESTOR_INTEREST');
    const suggestion = await generateInboxSuggestion('e_inv');
    expect(suggestion.suggestion.destination.available).toBe(false);
    expect(suggestion.suggestion.handoffPreview).toBeNull();
    const sme = await recordCanonicalEvent({
      eventType: CANONICAL_EVENTS.BUSINESS_CREATED,
      campaignId: 'camp_inv',
      storeId: 's1',
    });
    expect(sme.reason).toBe('investor_sme_lifecycle_blocked');
  });

  it('degrades safely when the model provider fails and never calls live Meta', async () => {
    process.env.ENABLE_MARKETING_AI_GENERATION_V1 = 'true';
    generateMock.mockRejectedValue(new Error('network'));
    const res = await classifyMarketingIntent({ text: 'I want to create a store' });
    expect(res.primaryIntent).toBe('CREATE_BUSINESS');
    expect(res.generationMeta.reason).toBe('model_failure');
    expect(Features.marketingOperator.livePublishingV1).toBe(false);
    expect(Features.marketingOperator.responseSendingV1).toBe(false);
  });
});
