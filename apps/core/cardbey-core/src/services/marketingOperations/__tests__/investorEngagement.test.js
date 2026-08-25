import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeEach, vi } from 'vitest';

const facebookPublishMock = vi.fn();
const executiveLeadCreate = vi.fn();

const store = {
  campaigns: [],
  opportunities: [],
  evidence: [],
  conversions: [],
};

vi.mock('../../marketingOperator/publishing/MetaFacebookPageProvider.js', () => ({
  publishPagePost: (...args) => facebookPublishMock(...args),
}));

vi.mock('../../marketingOperator/campaignService.js', () => ({
  listCampaigns: async () => store.campaigns,
}));

vi.mock('../../marketingOperator/repository.js', () => ({
  marketingRepo: {
    campaign: {
      findUnique: async ({ where }) => store.campaigns.find((c) => c.id === where.id) || null,
      findFirst: async ({ where } = {}) =>
        store.campaigns.find((c) => c.id === where?.id || c.id === where?.OR?.[0]?.id) ||
        store.campaigns[0] ||
        null,
      update: async ({ where, data }) => {
        const row = store.campaigns.find((c) => c.id === where.id);
        if (!row) return null;
        Object.assign(row, data);
        return row;
      },
    },
    researchOpportunity: {
      findUnique: async ({ where, include } = {}) => {
        const row = store.opportunities.find((o) => o.id === where.id);
        if (!row) return null;
        if (!include) return row;
        return { ...row, evidence: store.evidence.filter((e) => row.evidenceIds?.includes(e.id)) };
      },
    },
    researchEvidence: {
      findUnique: async ({ where }) => store.evidence.find((e) => e.id === where.id) || null,
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
      create: async (data) => ({ id: 'touch_1', ...data }),
    },
    executiveLead: { create: (...args) => executiveLeadCreate(...args) },
  },
  MarketingRepoError: class MarketingRepoError extends Error {},
}));

vi.mock('../../marketingOperator/audit.js', () => ({ appendMarketingAudit: async () => {} }));

import { CANONICAL_EVENTS, TARGET_TYPES } from '../constants.js';
import { EVIDENCE_KIND } from '../researchContract.js';
import {
  approveInvestorHandoff,
  getCanonicalInvestorLanding,
  listInvestorEngagements,
  prepareInvestorOutreachPack,
  prepareInvestorProfile,
  recordManualInvestorEvent,
  recordPublicInvestorPageEvent,
  resolveInvestorProjectionByToken,
  revokeInvestorAccess,
} from '../investorEngagementService.js';
import { INVESTOR_LIFECYCLE } from '../investorEngagementTrackingContract.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function seedApprovedInvestorCampaign() {
  store.evidence.push({
    id: 'ev1',
    kind: EVIDENCE_KIND.SOURCE_FACT,
    sourceTitle: 'Austrade',
    sourceUrl: 'https://www.austrade.gov.au/',
  });
  store.evidence.push({
    id: 'ev2',
    kind: EVIDENCE_KIND.AI_INTERPRETATION,
    sourceTitle: 'Analysis — not a source fact',
    sourceUrl: null,
  });
  store.opportunities.push({
    id: 'opp_inv',
    title: 'Australia inbound-investment theme',
    targetType: TARGET_TYPES.INVESTOR_DISCOVERY,
    opportunityType: 'INVESTOR_THEME',
    confidence: 0.55,
    market: 'au',
    evidenceIds: ['ev1', 'ev2'],
    evidence: store.evidence,
  });
  const proposal = {
    kind: 'CAMPAIGN_PROPOSAL_V1',
    status: 'APPROVED',
    purpose: 'INVESTOR',
    targetType: TARGET_TYPES.INVESTOR_DISCOVERY,
    workingTitle: 'Australia inbound-investment theme',
    opportunityId: 'opp_inv',
    objectiveId: 'obj_inv',
    researchTaskId: 'task_inv',
    sourceEvidence: [{ id: 'ev1', kind: EVIDENCE_KIND.SOURCE_FACT, sourceTitle: 'Austrade' }],
    destination: { available: false },
    liveMeta: false,
    provenance: {
      objectiveId: 'obj_inv',
      researchTaskId: 'task_inv',
      opportunityId: 'opp_inv',
      campaignId: 'camp_inv',
      chain: ['objective', 'research_task', 'evidence', 'opportunity', 'campaign_proposal'],
    },
  };
  const campaign = {
    id: 'camp_inv',
    name: 'Proposal: Australia inbound-investment theme',
    status: 'DRAFT',
    targetType: TARGET_TYPES.INVESTOR_DISCOVERY,
    market: 'au',
    metadata: {
      targetType: TARGET_TYPES.INVESTOR_DISCOVERY,
      proposalStatus: 'APPROVED',
      campaignProposal: proposal,
    },
    plan: { kind: 'CAMPAIGN_PROPOSAL_V1', ...proposal },
  };
  store.campaigns.push(campaign);
  return campaign;
}

describe('investorEngagementService 1G', () => {
  beforeEach(() => {
    store.campaigns = [];
    store.opportunities = [];
    store.evidence = [];
    store.conversions = [];
    facebookPublishMock.mockReset();
    executiveLeadCreate.mockReset();
    process.env.ENABLE_MARKETING_OPERATOR_V1 = 'true';
    process.env.ENABLE_MARKETING_ATTRIBUTION_V1 = 'true';
    process.env.ENABLE_INVESTOR_ENGAGEMENT_V1 = 'true';
    process.env.ENABLE_INVESTOR_PROFILE_V1 = 'true';
    process.env.ENABLE_INVESTOR_LANDING_PROJECTION_V1 = 'true';
    process.env.ENABLE_FACEBOOK_LIVE_PUBLISHING_V1 = 'false';
    globalThis.fetch = vi.fn();
  });

  it('prepares profile and pack idempotently without sending', async () => {
    seedApprovedInvestorCampaign();
    const first = await prepareInvestorProfile('camp_inv', { actorId: 'editor' });
    expect(first.ok).toBe(true);
    expect(first.reused).toBe(false);
    expect(first.profile.evidenceRefs.every((e) => e.kind === EVIDENCE_KIND.SOURCE_FACT)).toBe(true);
    expect(first.profile.interpretationRefs.every((e) => e.kind === EVIDENCE_KIND.AI_INTERPRETATION)).toBe(true);
    expect(first.profile.fitRationaleKind).toBe(EVIDENCE_KIND.AI_INTERPRETATION);
    expect(first.sends).toBe(false);
    expect(first.liveMeta).toBe(false);
    expect(first.profile.readinessState.livePublishReady).toBe(false);

    const second = await prepareInvestorProfile('camp_inv', { actorId: 'editor' });
    expect(second.reused).toBe(true);
    expect(store.campaigns.filter((c) => c.id === 'camp_inv')).toHaveLength(1);

    const pack1 = await prepareInvestorOutreachPack('camp_inv', { actorId: 'editor' });
    expect(pack1.pack.watermark).toMatch(/FOUNDER APPROVAL REQUIRED/);
    const pack2 = await prepareInvestorOutreachPack('camp_inv', { actorId: 'editor' });
    expect(pack2.reused).toBe(true);
    expect(facebookPublishMock).not.toHaveBeenCalled();
    expect(executiveLeadCreate).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('approves handoff idempotently as INVESTOR_HANDOFF with no side effects', async () => {
    seedApprovedInvestorCampaign();
    await prepareInvestorProfile('camp_inv', { actorId: 'editor' });
    await prepareInvestorOutreachPack('camp_inv', { actorId: 'editor' });
    const approved = await approveInvestorHandoff('camp_inv', { actorId: 'founder' });
    expect(approved.ok).toBe(true);
    expect(approved.sends).toBe(false);
    expect(approved.handoff.eventType).toBe(CANONICAL_EVENTS.INVESTOR_HANDOFF);
    expect(approved.handoff.status).toBe('APPROVED_FOR_HANDOFF');
    expect(approved.shareToken).toBeTruthy();
    expect(approved.campaignStatus || store.campaigns[0].status).toBe('DRAFT');
    expect(store.conversions).toHaveLength(1);
    expect(store.conversions[0].eventType).toBe(CANONICAL_EVENTS.INVESTOR_HANDOFF);
    expect(store.conversions[0].dedupeKey).toBe('investor_handoff:camp_inv');

    const again = await approveInvestorHandoff('camp_inv', { actorId: 'founder' });
    expect(again.reused).toBe(true);
    expect(store.conversions).toHaveLength(1);
    expect(facebookPublishMock).not.toHaveBeenCalled();
    expect(executiveLeadCreate).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('revokes tokens and refuses unauthorized/revoked access', async () => {
    seedApprovedInvestorCampaign();
    await prepareInvestorProfile('camp_inv', { actorId: 'editor' });
    await prepareInvestorOutreachPack('camp_inv', { actorId: 'editor' });
    const approved = await approveInvestorHandoff('camp_inv', { actorId: 'founder' });
    const token = approved.shareToken;
    const ok = await resolveInvestorProjectionByToken(token);
    expect(ok.ok).toBe(true);
    expect(ok.projection.sections.some((s) => s.key === 'raise_terms')).toBe(false);
    expect(ok.confidential).toBe(false);

    const bad = await resolveInvestorProjectionByToken('not-a-valid-token-value');
    expect(bad.ok).toBe(false);

    await revokeInvestorAccess('camp_inv', { actorId: 'founder' });
    const revoked = await resolveInvestorProjectionByToken(token);
    expect(revoked.ok).toBe(false);
    expect(revoked.error).toBe('revoked');
  });

  it('rejects user-acquisition proposals and flag-off writes', async () => {
    store.campaigns.push({
      id: 'camp_ua',
      status: 'DRAFT',
      targetType: TARGET_TYPES.USER_ACQUISITION,
      metadata: {
        campaignProposal: {
          kind: 'CAMPAIGN_PROPOSAL_V1',
          status: 'APPROVED',
          purpose: 'USER_ACQUISITION',
          targetType: TARGET_TYPES.USER_ACQUISITION,
          destination: { available: true },
        },
      },
    });
    const ua = await prepareInvestorProfile('camp_ua', { actorId: 'editor' });
    expect(ua.ok).toBe(false);
    expect(ua.error).toBe('not_investor_proposal');

    process.env.ENABLE_INVESTOR_ENGAGEMENT_V1 = 'false';
    seedApprovedInvestorCampaign();
    const skipped = await prepareInvestorProfile('camp_inv', { actorId: 'editor' });
    expect(skipped.skipped).toBe(true);
    expect(skipped.sends).toBe(false);
  });

  it('does not contain send, Meta, or ExecutiveLead writes in 1G sources', () => {
    const service = fs.readFileSync(path.join(here, '../investorEngagementService.js'), 'utf8');
    const contract = fs.readFileSync(path.join(here, '../investorEngagementContract.js'), 'utf8');
    expect(service).not.toMatch(/graph\.facebook\.com/);
    expect(service).not.toMatch(/executiveLead\.create/);
    expect(service).not.toMatch(/marketingRepo\.executiveLead/);
    expect(service).not.toMatch(/nodemailer/);
    expect(service).not.toMatch(/autoSubmit:\s*true/);
    expect(contract).not.toMatch(/livePublishReady:\s*true/);
  });

  it('serves canonical landing only when the projection flag is on', () => {
    const on = getCanonicalInvestorLanding();
    expect(on.ok).toBe(true);
    expect(on.projection.sections.some((s) => s.key === 'financials')).toBe(false);
    process.env.ENABLE_INVESTOR_LANDING_PROJECTION_V1 = 'false';
    const off = getCanonicalInvestorLanding();
    expect(off.ok).toBe(false);
  });

  it('does not infer CONTACTED from INVESTOR_HANDOFF', async () => {
    process.env.ENABLE_INVESTOR_ENGAGEMENT_TRACKING_V1 = 'true';
    seedApprovedInvestorCampaign();
    await prepareInvestorProfile('camp_inv', { actorId: 'editor' });
    await prepareInvestorOutreachPack('camp_inv', { actorId: 'editor' });
    const approved = await approveInvestorHandoff('camp_inv', { actorId: 'founder' });
    expect(approved.lifecycle).toBe(INVESTOR_LIFECYCLE.HANDOFF_APPROVED);
    expect(approved.lifecycle).not.toBe(INVESTOR_LIFECYCLE.CONTACTED);
    expect(approved.tracking.inferredContactedFromHandoff).toBe(false);
    expect(store.conversions.every((c) => c.eventType !== CANONICAL_EVENTS.INVESTOR_CONTACTED)).toBe(true);

    const listed = await listInvestorEngagements();
    expect(listed.pipeline.HANDOFF_APPROVED).toBe(1);
    expect(listed.pipeline.CONTACTED).toBe(0);
    expect(listed.attention.TOKEN_NO_ENGAGEMENT).toBeGreaterThan(0);
  });

  it('records CONTACTED only from an explicit manual event and stays idempotent', async () => {
    process.env.ENABLE_INVESTOR_ENGAGEMENT_TRACKING_V1 = 'true';
    seedApprovedInvestorCampaign();
    await prepareInvestorProfile('camp_inv', { actorId: 'editor' });
    await prepareInvestorOutreachPack('camp_inv', { actorId: 'editor' });
    const approved = await approveInvestorHandoff('camp_inv', { actorId: 'founder' });
    const page = await recordPublicInvestorPageEvent(approved.shareToken, {
      eventType: 'INVESTOR_PAGE_VIEWED',
    });
    expect(page.ok).toBe(true);
    expect(page.inferredContacted).toBe(false);

    const afterView = await listInvestorEngagements();
    expect(afterView.engagements[0].lifecycle).toBe(INVESTOR_LIFECYCLE.HANDOFF_APPROVED);

    const first = await recordManualInvestorEvent(
      'camp_inv',
      { eventType: 'INVESTOR_CONTACTED', occurredAt: '2026-08-17T10:00:00.000Z', idempotencyKey: 'contact-1' },
      { actorId: 'founder' },
    );
    expect(first.ok).toBe(true);
    expect(first.sends).toBe(false);
    expect(first.lifecycle).toBe(INVESTOR_LIFECYCLE.CONTACTED);
    const second = await recordManualInvestorEvent(
      'camp_inv',
      { eventType: 'INVESTOR_CONTACTED', occurredAt: '2026-08-17T10:00:00.000Z', idempotencyKey: 'contact-1' },
      { actorId: 'founder' },
    );
    expect(second.reused).toBe(true);
    expect(first.tracking.events.filter((e) => e.eventType === 'INVESTOR_CONTACTED')).toHaveLength(1);
    expect(facebookPublishMock).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
