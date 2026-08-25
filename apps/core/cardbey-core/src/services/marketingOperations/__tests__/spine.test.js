import { describe, expect, it, beforeEach, vi } from 'vitest';

const store = {
  objectives: [],
  campaigns: [],
  conversions: [],
  touches: [],
};

vi.mock('../../marketingOperator/repository.js', () => ({
  marketingRepo: {
    objective: {
      create: async (data) => {
        const row = { id: `obj_${store.objectives.length + 1}`, ...data, createdAt: new Date() };
        store.objectives.push(row);
        return row;
      },
      findFirst: async ({ where } = {}) =>
        store.objectives.find(
          (o) =>
            (!where?.name || o.name === where.name) &&
            (!where?.targetType || o.targetType === where.targetType),
        ) || null,
      findMany: async () => store.objectives,
      findUnique: async ({ where }) => store.objectives.find((o) => o.id === where.id) || null,
    },
    campaign: {
      create: async (data) => {
        const row = { id: `camp_${store.campaigns.length + 1}`, ...data };
        store.campaigns.push(row);
        return row;
      },
      findFirst: async ({ where } = {}) => {
        const or = where?.OR;
        if (or) {
          return (
            store.campaigns.find((c) => or.some((q) => c.id === q.id || c.name === q.name)) || null
          );
        }
        return store.campaigns[0] || null;
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
      findMany: async () => store.conversions,
    },
    attributionTouch: {
      create: async (data) => {
        const row = { id: `t_${store.touches.length + 1}`, ...data };
        store.touches.push(row);
        return row;
      },
    },
  },
  MarketingRepoError: class MarketingRepoError extends Error {},
}));

vi.mock('../../marketingOperator/audit.js', () => ({
  appendMarketingAudit: async () => {},
}));

import { Features } from '../../../config/features.js';
import {
  allowsSmeLifecycle,
  CANONICAL_EVENTS,
  createObjective,
  createTrackedHandoff,
  ingestGlobalLiveEoi,
  isInvestorDiscovery,
  normalizeCampaignWrite,
  recordCanonicalEvent,
  resolveTargetType,
  TARGET_TYPES,
  tryRecordSignup,
} from '../index.js';
import { assertApprovalSeparation } from '../approvalDuties.js';

describe('marketingOperations spine', () => {
  beforeEach(() => {
    store.objectives = [];
    store.campaigns = [];
    store.conversions = [];
    store.touches = [];
    process.env.ENABLE_MARKETING_OPERATOR_V1 = 'true';
    process.env.ENABLE_MARKETING_ATTRIBUTION_V1 = 'true';
    process.env.ENABLE_FACEBOOK_LIVE_PUBLISHING_V1 = 'false';
    delete process.env.MARKETING_PILOT_ALLOW_SELF_APPROVE;
  });

  it('creates USER_ACQUISITION and INVESTOR_DISCOVERY objectives without mixing types', async () => {
    const sme = await createObjective({
      name: 'SME',
      targetType: TARGET_TYPES.USER_ACQUISITION,
      market: 'vn',
    });
    const inv = await createObjective({
      name: 'Investors',
      targetType: TARGET_TYPES.INVESTOR_DISCOVERY,
      market: 'global',
    });
    expect(sme.targetType).toBe('USER_ACQUISITION');
    expect(inv.targetType).toBe('INVESTOR_DISCOVERY');
    expect(isInvestorDiscovery(inv.targetType)).toBe(true);
    expect(allowsSmeLifecycle(inv.targetType)).toBe(false);
  });

  it('links campaigns to objectiveId and keeps channel generic', () => {
    const sme = normalizeCampaignWrite({
      name: 'FB SME',
      objectiveId: 'obj_1',
      targetType: 'USER_ACQUISITION',
      channel: 'facebook',
      market: 'vn',
      offer: 'pilot',
      cta: 'Join',
    });
    const inv = normalizeCampaignWrite({
      name: 'Investor teaser',
      objectiveId: 'obj_2',
      targetType: 'INVESTOR_DISCOVERY',
      channel: 'facebook',
    });
    expect(sme.objectiveId).toBe('obj_1');
    expect(sme.channel).toBe('facebook');
    expect(inv.targetType).toBe('INVESTOR_DISCOVERY');
    expect(inv.metadata.targetType).toBe('INVESTOR_DISCOVERY');
  });

  it('denies self-approve unless audited override', () => {
    const denied = assertApprovalSeparation({ createdBy: 'a', actorId: 'a' });
    expect(denied.ok).toBe(false);
    expect(denied.error).toBe('self_approve_denied');
    process.env.MARKETING_PILOT_ALLOW_SELF_APPROVE = 'true';
    const allowed = assertApprovalSeparation({ createdBy: 'a', actorId: 'a' });
    expect(allowed.ok).toBe(true);
    expect(allowed.selfApproveOverride).toBe(true);
    const other = assertApprovalSeparation({ createdBy: 'a', actorId: 'b' });
    expect(other.ok).toBe(true);
  });

  it('builds tracked handoff with UTM without requiring login', () => {
    const dest = createTrackedHandoff({
      baseUrl: 'https://cardbey.com/pilot',
      campaignId: 'camp1',
      channel: 'facebook',
      provider: 'facebook',
      contentId: 'c1',
      source: 'organic',
      language: 'vi',
    });
    expect(dest.ok).toBe(true);
    expect(dest.url).toContain('campaignId=camp1');
    expect(dest.url).toContain('utm_source=organic');
    expect(dest.url).toContain('cb_attr=1');
    expect(dest.params.campaignId).toBe('camp1');
  });

  it('records signup against campaign/correlation context', async () => {
    expect(Features.marketingOperator.livePublishingV1).toBe(false);
    const res = await tryRecordSignup(
      { query: { campaignId: 'camp1', utm_source: 'facebook' } },
      { id: 'user_1' },
    );
    expect(res.ok).toBe(true);
    expect(res.eventType).toBe(CANONICAL_EVENTS.SIGNUP);
    expect(store.conversions[0].userId).toBe('user_1');
  });

  it('records EOI_SUBMITTED for USER_ACQUISITION campaigns', async () => {
    store.campaigns.push({
      id: 'camp_sme',
      name: 'SME',
      targetType: TARGET_TYPES.USER_ACQUISITION,
    });
    const res = await ingestGlobalLiveEoi({
      id: 'eoi_1',
      utmCampaign: 'camp_sme',
      utmSource: 'facebook',
      source: 'facebook',
      userId: 'u1',
      publicReference: 'GLTEST',
    });
    expect(res.ok).toBe(true);
    expect(res.eventType).toBe(CANONICAL_EVENTS.EOI_SUBMITTED);
  });

  it('does not route INVESTOR_DISCOVERY into SME EOI/store lifecycle', async () => {
    store.campaigns.push({
      id: 'camp_inv',
      name: 'Investor',
      targetType: TARGET_TYPES.INVESTOR_DISCOVERY,
    });
    const eoi = await ingestGlobalLiveEoi({
      id: 'eoi_inv',
      utmCampaign: 'camp_inv',
      utmSource: 'facebook',
      publicReference: 'GLINV',
    });
    expect(eoi.ok).toBe(true);
    expect(eoi.eventType).not.toBe(CANONICAL_EVENTS.EOI_SUBMITTED);
    expect(eoi.targetType).toBe(TARGET_TYPES.INVESTOR_DISCOVERY);

    const smeBlocked = await recordCanonicalEvent({
      eventType: CANONICAL_EVENTS.BUSINESS_CREATED,
      campaignId: 'camp_inv',
      storeId: 'store_x',
      userId: 'u_inv',
    });
    expect(smeBlocked.skipped).toBe(true);
    expect(smeBlocked.reason).toBe('investor_sme_lifecycle_blocked');
    expect(store.conversions.some((c) => c.eventType === CANONICAL_EVENTS.BUSINESS_CREATED)).toBe(
      false,
    );
  });

  it('records business-created and published for USER_ACQUISITION', async () => {
    store.campaigns.push({
      id: 'camp_sme',
      targetType: TARGET_TYPES.USER_ACQUISITION,
    });
    const created = await recordCanonicalEvent({
      eventType: CANONICAL_EVENTS.BUSINESS_CREATED,
      campaignId: 'camp_sme',
      storeId: 'biz_1',
      userId: 'u1',
      dedupeKey: 'business_created:biz_1',
    });
    const published = await recordCanonicalEvent({
      eventType: CANONICAL_EVENTS.BUSINESS_PUBLISHED,
      campaignId: 'camp_sme',
      storeId: 'biz_1',
      userId: 'u1',
      dedupeKey: 'business_published:biz_1',
    });
    expect(created.ok).toBe(true);
    expect(published.ok).toBe(true);
  });

  it('defaults unknown targetType to USER_ACQUISITION and keeps live Meta off', () => {
    expect(resolveTargetType('nope')).toBe(TARGET_TYPES.USER_ACQUISITION);
    expect(Features.marketingOperator.livePublishingV1).toBe(false);
  });
});
