import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeEach, vi } from 'vitest';

const generateMock = vi.fn();
const facebookPublishMock = vi.fn();
const executiveLeadCreate = vi.fn();
const storeCreate = vi.fn();

const store = {
  objectives: [],
  tasks: [],
  evidence: [],
  opportunities: [],
  campaigns: [],
};

vi.mock('../../../lib/llm/llmGateway.ts', () => ({
  llmGateway: {
    generate: (...args) => generateMock(...args),
  },
}));

vi.mock('../../marketingOperator/publishing/MetaFacebookPageProvider.js', () => ({
  publishPagePost: (...args) => facebookPublishMock(...args),
  default: { publishPagePost: (...args) => facebookPublishMock(...args) },
}));

vi.mock('../../marketingOperator/campaignService.js', () => ({
  createCampaign: async (data) => {
    const row = {
      id: `camp_${store.campaigns.length + 1}`,
      status: data.status || 'DRAFT',
      createdBy: data.createdBy || null,
      ...data,
    };
    store.campaigns.push(row);
    return row;
  },
  listCampaigns: async () => store.campaigns,
}));

vi.mock('../../marketingOperator/repository.js', () => ({
  marketingRepo: {
    objective: {
      create: async (data) => {
        const row = { id: `obj_${store.objectives.length + 1}`, createdAt: new Date(), ...data };
        store.objectives.push(row);
        return row;
      },
      findMany: async () => store.objectives,
      findFirst: async ({ where } = {}) =>
        store.objectives.find(
          (o) =>
            (!where?.name || o.name === where.name) &&
            (!where?.targetType || o.targetType === where.targetType),
        ) || null,
      findUnique: async ({ where }) => store.objectives.find((o) => o.id === where.id) || null,
    },
    researchTask: {
      create: async (data) => {
        const row = {
          id: `task_${store.tasks.length + 1}`,
          createdAt: new Date(),
          ...data,
        };
        store.tasks.push(row);
        return row;
      },
      findMany: async ({ where } = {}) =>
        store.tasks.filter(
          (t) =>
            (!where?.status || t.status === where.status) &&
            (!where?.targetType || t.targetType === where.targetType) &&
            (!where?.objectiveId || t.objectiveId === where.objectiveId),
        ),
      findUnique: async ({ where }) => store.tasks.find((t) => t.id === where.id) || null,
      update: async ({ where, data }) => {
        const row = store.tasks.find((t) => t.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    researchEvidence: {
      create: async (data) => {
        const row = { id: `ev_${store.evidence.length + 1}`, createdAt: new Date(), ...data };
        store.evidence.push(row);
        return row;
      },
      findMany: async ({ where } = {}) =>
        store.evidence.filter((e) => !where?.taskId || e.taskId === where.taskId),
      findUnique: async ({ where }) => store.evidence.find((e) => e.id === where.id) || null,
    },
    researchOpportunity: {
      create: async (data) => {
        const row = { id: `opp_${store.opportunities.length + 1}`, createdAt: new Date(), ...data };
        store.opportunities.push(row);
        return row;
      },
      findMany: async ({ where } = {}) =>
        store.opportunities.filter(
          (o) =>
            (!where?.status || o.status === where.status) &&
            (!where?.targetType || o.targetType === where.targetType) &&
            (!where?.objectiveId || o.objectiveId === where.objectiveId),
        ),
      findUnique: async ({ where, include } = {}) => {
        const row = store.opportunities.find((o) => o.id === where.id);
        if (!row) return null;
        if (!include) return row;
        return {
          ...row,
          objective: store.objectives.find((o) => o.id === row.objectiveId) || null,
          task: {
            ...(store.tasks.find((t) => t.id === row.taskId) || {}),
            evidence: store.evidence.filter((e) => e.taskId === row.taskId),
          },
        };
      },
      update: async ({ where, data }) => {
        const row = store.opportunities.find((o) => o.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    executiveLead: { create: (...args) => executiveLeadCreate(...args) },
    store: { create: (...args) => storeCreate(...args) },
    campaign: {
      findUnique: async ({ where }) => store.campaigns.find((c) => c.id === where.id) || null,
      update: async ({ where, data }) => {
        const row = store.campaigns.find((c) => c.id === where.id);
        if (!row) return null;
        Object.assign(row, data);
        return row;
      },
    },
  },
  MarketingRepoError: class MarketingRepoError extends Error {},
}));

vi.mock('../../marketingOperator/audit.js', () => ({ appendMarketingAudit: async () => {} }));

import { Features } from '../../../config/features.js';
import { TARGET_TYPES } from '../constants.js';
import { matchResearchCatalog } from '../researchCatalog.js';
import { EVIDENCE_KIND, OPPORTUNITY_STATES, PILOT_OBJECTIVE_SEEDS } from '../researchContract.js';
import { runObjectiveResearch } from '../researchOrchestrator.js';
import {
  approveOpportunity,
  archiveOpportunity,
  prepareCampaignFromOpportunity,
  rejectOpportunity,
  reviewOpportunity,
} from '../opportunityService.js';
import {
  approveCampaignProposal,
  patchCampaignProposal,
  submitCampaignProposal,
} from '../campaignProposalService.js';
import { ensurePilotResearchObjectives } from '../seedPilotObjectives.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function seedObjective(overrides = {}) {
  const row = {
    id: overrides.id || `obj_${store.objectives.length + 1}`,
    name: 'Vietnamese SMEs → Cardbey',
    targetType: TARGET_TYPES.USER_ACQUISITION,
    status: 'ACTIVE',
    market: 'vn',
    language: 'vi',
    goal: PILOT_OBJECTIVE_SEEDS[0].question,
    ...overrides,
  };
  store.objectives.push(row);
  return row;
}

describe('marketingOperations research + opportunities', () => {
  beforeEach(() => {
    store.objectives = [];
    store.tasks = [];
    store.evidence = [];
    store.opportunities = [];
    store.campaigns = [];
    generateMock.mockReset();
    facebookPublishMock.mockReset();
    executiveLeadCreate.mockReset();
    storeCreate.mockReset();
    process.env.ENABLE_MARKETING_OPERATOR_V1 = 'true';
    process.env.ENABLE_MARKETING_AI_GENERATION_V1 = 'false';
    process.env.ENABLE_FACEBOOK_LIVE_PUBLISHING_V1 = 'false';
    process.env.ENABLE_MARKETING_AUTO_SCHEDULE_V1 = 'false';
    globalThis.fetch = vi.fn();
  });

  it('runs USER_ACQUISITION research with SOURCE_FACT vs AI interpretation', async () => {
    const objective = seedObjective();
    const result = await runObjectiveResearch(objective.id, {}, { actorId: 'admin' });
    expect(result.ok).toBe(true);
    expect(result.task.targetType).toBe(TARGET_TYPES.USER_ACQUISITION);
    expect(result.task.status).toBe('COMPLETED');
    const facts = result.evidence.filter((e) => e.kind === EVIDENCE_KIND.SOURCE_FACT);
    const interp = result.evidence.filter((e) => e.kind === EVIDENCE_KIND.AI_INTERPRETATION);
    expect(facts.length).toBeGreaterThan(0);
    expect(interp).toHaveLength(1);
    expect(facts.every((f) => f.sourceTitle && f.summary)).toBe(true);
    expect(interp[0].sourceUrl).toBeNull();
    expect(interp[0].sourceTitle).toMatch(/not a source fact/i);
    expect(result.opportunities.length).toBeGreaterThan(0);
    expect(result.opportunities.every((o) => o.targetType === TARGET_TYPES.USER_ACQUISITION)).toBe(true);
    expect(result.liveMeta).toBe(false);
    expect(result.facebookPublish).toBe(false);
  });

  it('runs INVESTOR_DISCOVERY research without CRM or people enrollment', async () => {
    const objective = seedObjective({
      id: 'obj_inv',
      name: PILOT_OBJECTIVE_SEEDS[2].name,
      targetType: TARGET_TYPES.INVESTOR_DISCOVERY,
      market: 'global',
      language: 'en',
      goal: PILOT_OBJECTIVE_SEEDS[2].question,
    });
    const result = await runObjectiveResearch(objective.id);
    expect(result.ok).toBe(true);
    expect(result.task.targetType).toBe(TARGET_TYPES.INVESTOR_DISCOVERY);
    expect(result.opportunities.length).toBeGreaterThan(0);
    expect(result.opportunities.every((o) => o.targetType === TARGET_TYPES.INVESTOR_DISCOVERY)).toBe(
      true,
    );
    expect(result.opportunities.every((o) => o.metadata.investorCrm === false)).toBe(true);
    expect(result.opportunities.every((o) => o.metadata.executiveLead === false)).toBe(true);
    expect(result.investorCrm).toBe(false);
    expect(executiveLeadCreate).not.toHaveBeenCalled();
  });

  it('keeps USER_ACQUISITION and INVESTOR_DISCOVERY targetTypes separate', async () => {
    seedObjective({ id: 'obj_ua', goal: PILOT_OBJECTIVE_SEEDS[0].question });
    seedObjective({
      id: 'obj_inv',
      name: PILOT_OBJECTIVE_SEEDS[2].name,
      targetType: TARGET_TYPES.INVESTOR_DISCOVERY,
      goal: PILOT_OBJECTIVE_SEEDS[2].question,
    });
    await runObjectiveResearch('obj_ua');
    await runObjectiveResearch('obj_inv');
    const ua = store.opportunities.filter((o) => o.targetType === TARGET_TYPES.USER_ACQUISITION);
    const inv = store.opportunities.filter((o) => o.targetType === TARGET_TYPES.INVESTOR_DISCOVERY);
    expect(ua.length).toBeGreaterThan(0);
    expect(inv.length).toBeGreaterThan(0);
    expect(ua.some((o) => o.targetType === TARGET_TYPES.INVESTOR_DISCOVERY)).toBe(false);
  });

  it('persists evidence and does not treat LLM text as a source fact', async () => {
    process.env.ENABLE_MARKETING_AI_GENERATION_V1 = 'true';
    generateMock.mockResolvedValue({
      content: JSON.stringify({ summary: 'Model summary of catalog facts only.' }),
      provider: 'mock',
      model: 'mock-1',
    });
    const objective = seedObjective();
    const result = await runObjectiveResearch(objective.id);
    const facts = store.evidence.filter((e) => e.kind === EVIDENCE_KIND.SOURCE_FACT);
    const interp = store.evidence.filter((e) => e.kind === EVIDENCE_KIND.AI_INTERPRETATION);
    expect(facts.every((f) => f.metadata?.factNotModel === true)).toBe(true);
    expect(interp[0].summary).toMatch(/catalog facts/i);
    expect(interp[0].kind).toBe(EVIDENCE_KIND.AI_INTERPRETATION);
    expect(result.opportunities[0].rationale).toBe(interp[0].summary);
  });

  it('creates a low-confidence opportunity when catalog evidence is missing', async () => {
    const objective = seedObjective({
      goal: 'zzzzqwerty unmatched token salad with no catalog overlap',
    });
    const result = await runObjectiveResearch(objective.id);
    expect(result.ok).toBe(true);
    expect(result.task.status).toBe('REVIEW_REQUIRED');
    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0].metadata.weakEvidence).toBe(true);
    expect(result.opportunities[0].confidence).toBeLessThan(0.3);
    expect(result.evidence.filter((e) => e.kind === EVIDENCE_KIND.SOURCE_FACT)).toHaveLength(0);
  });

  it('degrades when the model provider fails', async () => {
    process.env.ENABLE_MARKETING_AI_GENERATION_V1 = 'true';
    generateMock.mockRejectedValue(new Error('provider down'));
    const objective = seedObjective();
    const result = await runObjectiveResearch(objective.id);
    expect(result.ok).toBe(true);
    const interp = result.evidence.find((e) => e.kind === EVIDENCE_KIND.AI_INTERPRETATION);
    expect(interp.metadata.reason).toBe('model_failure');
    expect(interp.summary).toMatch(/failed/i);
  });

  it('supports review, approve, reject, and archive without auto-creating campaigns', async () => {
    const objective = seedObjective();
    const result = await runObjectiveResearch(objective.id);
    const id = result.opportunities[0].id;
    expect((await reviewOpportunity(id, { actorId: 'admin' })).opportunity.status).toBe(
      OPPORTUNITY_STATES.REVIEWING,
    );
    expect((await approveOpportunity(id, { actorId: 'admin' })).opportunity.status).toBe(
      OPPORTUNITY_STATES.APPROVED,
    );
    expect(store.campaigns).toHaveLength(0);
    const rejected = await rejectOpportunity(id, { actorId: 'admin' });
    expect(rejected.opportunity.status).toBe(OPPORTUNITY_STATES.REJECTED);
    const archived = await archiveOpportunity(id, { actorId: 'admin' });
    expect(archived.opportunity.status).toBe(OPPORTUNITY_STATES.ARCHIVED);
    expect(store.campaigns).toHaveLength(0);
  });

  it('prepares a local DRAFT campaign only from an approved opportunity', async () => {
    const objective = seedObjective();
    const result = await runObjectiveResearch(objective.id);
    const id = result.opportunities[0].id;
    const blocked = await prepareCampaignFromOpportunity(id);
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toBe('opportunity_not_approved');
    await approveOpportunity(id, { actorId: 'admin' });
    const prepared = await prepareCampaignFromOpportunity(id, { actorId: 'admin' });
    expect(prepared.ok).toBe(true);
    expect(prepared.campaign.status).toBe('DRAFT');
    expect(prepared.publishes).toBe(false);
    expect(prepared.scheduled).toBe(false);
    expect(prepared.liveMeta).toBe(false);
    expect(prepared.campaign.metadata.preparedFromOpportunityId).toBe(id);
    expect(prepared.proposal.kind).toBe('CAMPAIGN_PROPOSAL_V1');
    expect(prepared.proposal.provenance.opportunityId).toBe(id);
    expect(prepared.proposal.provenance.objectiveId).toBe(objective.id);
    expect(prepared.proposal.provenance.researchTaskId).toBe(result.task.id);
    expect(prepared.proposal.sourceEvidence.length).toBeGreaterThan(0);
    expect(prepared.proposal.liveMeta).toBe(false);
    expect(prepared.readiness.livePublishReady).toBe(false);
    const again = await prepareCampaignFromOpportunity(id, { actorId: 'admin' });
    expect(again.reused).toBe(true);
    expect(store.campaigns).toHaveLength(1);
  });

  it('never publishes, calls Facebook, writes ExecutiveLead, or creates stores', async () => {
    const objective = seedObjective();
    const result = await runObjectiveResearch(objective.id);
    await approveOpportunity(result.opportunities[0].id, { actorId: 'admin' });
    expect(result.facebookPublish).toBe(false);
    expect(facebookPublishMock).not.toHaveBeenCalled();
    expect(executiveLeadCreate).not.toHaveBeenCalled();
    expect(storeCreate).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(Features.marketingOperator.livePublishingV1).toBe(false);
    expect(Features.marketingOperator.autoScheduleV1).toBe(false);
  });

  it('seeds the three real pilot objectives idempotently', async () => {
    const first = await ensurePilotResearchObjectives({ actorId: 'admin' });
    const second = await ensurePilotResearchObjectives({ actorId: 'admin' });
    expect(first).toHaveLength(3);
    expect(second).toHaveLength(3);
    expect(store.objectives).toHaveLength(3);
    expect(store.objectives.map((o) => o.name).sort()).toEqual(
      PILOT_OBJECTIVE_SEEDS.map((s) => s.name).sort(),
    );
  });

  it('matches catalog entries for the packaging pilot question', () => {
    const matches = matchResearchCatalog({
      question: PILOT_OBJECTIVE_SEEDS[1].question,
      targetType: TARGET_TYPES.USER_ACQUISITION,
      market: 'vn-au',
    });
    expect(matches.some((m) => m.opportunityType === 'MARKET_ENTRY' || m.id === 'dfat_vietnam')).toBe(
      true,
    );
  });

  it('does not contain live scrape, Facebook Graph, or ExecutiveLead writes in the orchestrator', () => {
    const src = fs.readFileSync(path.join(here, '../researchOrchestrator.js'), 'utf8');
    expect(src).not.toMatch(/graph\.facebook\.com/);
    expect(src).not.toMatch(/ExecutiveLead/);
    expect(src).not.toMatch(/fetchHtml/);
    expect(src).not.toMatch(/searchResourcesForConsumer/);
    expect(src).not.toMatch(/autoSubmit:\s*true/);
  });

  it('does not issue a public CTA for investor-discovery proposals', async () => {
    const objective = seedObjective({
      id: 'obj_inv_cta',
      name: PILOT_OBJECTIVE_SEEDS[2].name,
      targetType: TARGET_TYPES.INVESTOR_DISCOVERY,
      market: 'global',
      language: 'en',
      goal: PILOT_OBJECTIVE_SEEDS[2].question,
    });
    const result = await runObjectiveResearch(objective.id);
    const id = result.opportunities[0].id;
    await approveOpportunity(id, { actorId: 'editor' });
    const prepared = await prepareCampaignFromOpportunity(id, { actorId: 'editor' });
    expect(prepared.ok).toBe(true);
    expect(prepared.proposal.targetType).toBe(TARGET_TYPES.INVESTOR_DISCOVERY);
    expect(prepared.proposal.ctaLabel).toBeNull();
    expect(prepared.proposal.destination.available).toBe(false);
    expect(prepared.proposal.purpose).toBe('INVESTOR');
    expect(prepared.proposal.attribution.trackedUrl).toBeNull();
    expect(prepared.liveMeta).toBe(false);
    expect(executiveLeadCreate).not.toHaveBeenCalled();
  });

  it('submits and approves a proposal without publishing', async () => {
    const objective = seedObjective();
    const result = await runObjectiveResearch(objective.id);
    const id = result.opportunities[0].id;
    await approveOpportunity(id, { actorId: 'editor' });
    const prepared = await prepareCampaignFromOpportunity(id, { actorId: 'editor' });
    const campaignId = prepared.campaign.id;
    const edited = await patchCampaignProposal(campaignId, {
      workingTitle: 'Vietnamese SMEs can start on Cardbey, under development',
      angleWhy: 'Public catalog evidence supports a market-entry education angle.',
    }, { actorId: 'editor' });
    expect(edited.ok).toBe(true);
    const submitted = await submitCampaignProposal(campaignId, { actorId: 'editor' });
    expect(submitted.ok).toBe(true);
    expect(submitted.proposal.status).toBe('READY_FOR_REVIEW');
    const approved = await approveCampaignProposal(campaignId, { actorId: 'approver' });
    expect(approved.ok).toBe(true);
    expect(approved.proposal.status).toBe('APPROVED');
    expect(approved.campaign.status).toBe('DRAFT');
    expect(approved.publishes).toBe(false);
    expect(approved.liveMeta).toBe(false);
    expect(approved.readiness.livePublishReady).toBe(false);
    expect(facebookPublishMock).not.toHaveBeenCalled();
  });
});
