/**
 * Controlled pilot end-to-end (mocked prisma delegates).
 * Covers: create → generate → submit → approve → schedule → worker → mock engagement → simulate funnel.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';

const db = {
  campaigns: [],
  content: [],
  versions: [],
  approvals: [],
  publications: [],
  engagements: [],
  drafts: [],
  touches: [],
  conversions: [],
};

function id(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

vi.mock('../repository.js', () => ({
  marketingRepo: {
    objective: {
      findFirst: async () => null,
      create: async (data) => ({ id: 'obj_default', status: 'ACTIVE', ...data }),
    },
    campaign: {
      create: async (data) => {
        const row = { id: id('camp'), ...data, createdAt: new Date() };
        db.campaigns.push(row);
        return row;
      },
      findUnique: async ({ where }) => db.campaigns.find((c) => c.id === where.id) || null,
      update: async ({ where, data }) => {
        const row = db.campaigns.find((c) => c.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    content: {
      create: async (data) => {
        const row = { id: id('c'), ...data };
        db.content.push(row);
        return row;
      },
      findUnique: async ({ where, include }) => {
        const row = db.content.find((c) => c.id === where.id);
        if (!row) return null;
        if (include?.versions) {
          return {
            ...row,
            versions: db.versions.filter((v) => v.contentId === row.id).sort((a, b) => b.version - a.version),
          };
        }
        return row;
      },
      update: async ({ where, data }) => {
        const row = db.content.find((c) => c.id === where.id);
        Object.assign(row, data);
        return row;
      },
      findMany: async () => db.content,
    },
    version: {
      create: async (data) => {
        const row = { id: id('v'), ...data };
        db.versions.push(row);
        return row;
      },
    },
    approval: {
      create: async (data) => {
        const row = { id: id('a'), ...data };
        db.approvals.push(row);
        return row;
      },
      findFirst: async ({ where }) =>
        db.approvals.find(
          (a) =>
            a.contentId === where.contentId &&
            a.status === where.status &&
            a.invalidatedAt == null,
        ) || null,
      updateMany: async ({ data }) => {
        for (const a of db.approvals) {
          if (a.status === 'APPROVED' && !a.invalidatedAt) Object.assign(a, data);
        }
        return { count: 1 };
      },
    },
    publication: {
      findUnique: async ({ where }) =>
        db.publications.find((p) => p.idempotencyKey === where.idempotencyKey) || null,
      create: async (data) => {
        const row = { id: id('p'), retryCount: 0, claimedAt: null, lockExpiresAt: null, ...data };
        db.publications.push(row);
        return row;
      },
      findMany: async ({ where }) => {
        return db.publications.filter((p) => {
          if (where?.status && p.status !== where.status) return false;
          if (where?.scheduledAt?.lte && p.scheduledAt > where.scheduledAt.lte) return false;
          return true;
        }).map((p) => ({
          ...p,
          campaign: db.campaigns.find((c) => c.id === p.campaignId) || { status: 'DRAFT' },
          content: db.content.find((c) => c.id === p.contentId) || { body: '' },
        }));
      },
      updateMany: async ({ where, data }) => {
        const pub = db.publications.find((p) => p.id === where.id);
        if (!pub || pub.status !== 'SCHEDULED') return { count: 0 };
        Object.assign(pub, data);
        return { count: 1 };
      },
      update: async ({ where, data }) => {
        const pub = db.publications.find((p) => p.id === where.id);
        Object.assign(pub, data);
        return pub;
      },
    },
    engagement: {
      create: async (data) => {
        const row = { id: id('e'), ...data };
        db.engagements.push(row);
        return row;
      },
      findFirst: async ({ where } = {}) =>
        db.engagements.find(
          (e) =>
            (!where?.provider || e.provider === where.provider) &&
            (!where?.externalId || e.externalId === where.externalId),
        ) || null,
      findUnique: async ({ where, include }) => {
        const row = db.engagements.find((e) => e.id === where.id);
        if (!row) return null;
        if (include?.responseDrafts) {
          return {
            ...row,
            responseDrafts: db.drafts.filter((d) => d.engagementId === row.id),
          };
        }
        return row;
      },
      update: async ({ where, data }) => {
        const row = db.engagements.find((e) => e.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    responseDraft: {
      create: async (data) => {
        const row = { id: id('d'), ...data };
        db.drafts.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = db.drafts.find((d) => d.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    attributionTouch: {
      create: async (data) => {
        const row = { id: id('t'), ...data };
        db.touches.push(row);
        return row;
      },
      findFirst: async () => db.touches[db.touches.length - 1] || null,
    },
    conversion: {
      findFirst: async ({ where }) =>
        db.conversions.find((c) => c.dedupeKey === where.dedupeKey) || null,
      create: async (data) => {
        const row = { id: id('cv'), ...data };
        db.conversions.push(row);
        return row;
      },
      findMany: async () => db.conversions,
    },
    metric: { findMany: async () => [] },
  },
}));

vi.mock('../audit.js', () => ({ appendMarketingAudit: async () => {} }));
vi.mock('../../../lib/llm/llmGateway.ts', () => ({
  llmGateway: { generate: async () => ({ content: 'not-json' }) },
}));

import * as campaignService from '../campaignService.js';
import * as contentService from '../contentService.js';
import { injectMockEngagement, generateResponseDraft, mockSendResponse } from '../engagementService.js';
import { simulateFunnelForPilot } from '../attributionService.js';
import { processDueMarketingPublications } from '../schedulingWorker.js';
import { getMarketingAnalytics } from '../operatorFacade.js';

describe('marketingOperator/controlledPilotScenario', () => {
  beforeEach(() => {
    for (const k of Object.keys(db)) db[k] = [];
    process.env.ENABLE_MARKETING_OPERATOR_V1 = 'true';
    process.env.ENABLE_MARKETING_APPROVAL_WORKFLOW_V1 = 'true';
    process.env.ENABLE_MARKETING_AI_GENERATION_V1 = 'true';
    process.env.ENABLE_MARKETING_AUTO_SCHEDULE_V1 = 'true';
    process.env.ENABLE_MARKETING_ANALYTICS_V1 = 'true';
    process.env.ENABLE_MARKETING_ATTRIBUTION_V1 = 'true';
    process.env.ENABLE_FACEBOOK_LIVE_PUBLISHING_V1 = 'false';
    delete process.env.MARKETING_PILOT_ALLOW_SELF_APPROVE;
  });

  it('runs mock pilot path end-to-end', async () => {
    const campaign = await campaignService.createCampaign(
      { name: 'Pilot', objective: 'pilot_invite' },
      { actorId: 'editor1' },
    );
    const gen = await campaignService.generateCampaignContent(campaign.id, {
      actorId: 'editor1',
      language: 'en',
    });
    expect(gen.ok).toBe(true);
    const content = gen.content[0];
    expect(content.generationMeta?.mode).toBe('deterministic_fallback');

    const submitted = await contentService.submitForApproval(content.id, { actorId: 'editor1' });
    expect(submitted.validation.ok).toBe(true);

    const self = await contentService.approveContent(content.id, { actorId: 'editor1' });
    expect(self.error).toBe('self_approve_denied');

    const approved = await contentService.approveContent(content.id, { actorId: 'approver1' });
    expect(approved.ok).toBe(true);

    const scheduled = await contentService.scheduleContent(content.id, {
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
      actorId: 'publisher1',
    });
    expect(scheduled.ok).toBe(true);

    const cycle = await processDueMarketingPublications({ force: true });
    expect(cycle.provider).toBe('mock');
    expect(cycle.processed).toBeGreaterThanOrEqual(1);

    const eng = await injectMockEngagement({
      type: 'HOW_TO_START',
      campaignId: campaign.id,
      body: 'How do I start?',
    });
    await generateResponseDraft(eng.engagement.id);
    const sent = await mockSendResponse(eng.engagement.id);
    expect(sent.meta).toBe(false);

    const funnel = await simulateFunnelForPilot(campaign.id);
    expect(funnel.conversions.length).toBe(6);

    const analytics = await getMarketingAnalytics({ campaignId: campaign.id });
    expect(analytics.ok).toBe(true);
    expect(analytics.stages.some((s) => s.count > 0 && s.source === 'simulated')).toBe(true);
    expect(analytics.liveMetaVerified).toBe(false);
  });
});
