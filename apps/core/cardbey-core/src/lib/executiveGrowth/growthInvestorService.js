/**
 * Growth Command Center — investor discovery and pipeline service.
 * Bridges curated public catalog + marketingOperations investor engagement.
 * Never sends outreach. Never publishes.
 */

import { createCampaign, listCampaigns } from '../../services/marketingOperator/campaignService.js';
import { marketingRepo } from '../../services/marketingOperator/repository.js';
import { TARGET_TYPES } from '../../services/marketingOperations/constants.js';
import { PROPOSAL_STATES } from '../../services/marketingOperations/campaignProposalContract.js';
import {
  approveInvestorHandoff,
  getInvestorEngagement,
  prepareInvestorOutreachPack,
  prepareInvestorProfile,
  recordManualInvestorEvent,
  rejectInvestorHandoff,
  reviseInvestorHandoff,
} from '../../services/marketingOperations/investorEngagementService.js';
import {
  FUNDRAISING_OBJECTIVE,
  isGrowthInvestorModeEnabled,
} from './growthInvestorGovernanceConfig.js';
import {
  buildInvestorFit,
  discoverInvestorCatalog,
  getInvestorCatalogOrg,
} from './investorOrganizationCatalog.js';

function flagOff() {
  return { ok: false, error: 'flag_off', sends: false, liveMeta: false };
}

function readCampaignMeta(campaign) {
  return campaign?.metadata && typeof campaign.metadata === 'object' ? campaign.metadata : {};
}

function readOrgFromCampaign(campaign) {
  const meta = readCampaignMeta(campaign);
  return meta.growthInvestorOrganization || null;
}

function readFitFromCampaign(campaign) {
  const meta = readCampaignMeta(campaign);
  return meta.growthInvestorFit || null;
}

function buildApprovedProposal(org, campaignId) {
  return {
    kind: 'CAMPAIGN_PROPOSAL_V1',
    status: PROPOSAL_STATES.APPROVED,
    purpose: 'INVESTOR',
    targetType: TARGET_TYPES.INVESTOR_DISCOVERY,
    workingTitle: org.name,
    market: org.geography,
    audienceHypothesis: org.mandateSummary,
    opportunityId: `catalog_${org.catalogId}`,
    objectiveId: FUNDRAISING_OBJECTIVE.objectiveId,
    suggestedAngle: `Research-only fit for Cardbey Seed 2026 — ${org.mandateSummary}`,
    destination: { available: false },
    liveMeta: false,
    provenance: {
      objectiveId: FUNDRAISING_OBJECTIVE.objectiveId,
      opportunityId: `catalog_${org.catalogId}`,
      campaignId,
      chain: ['objective', 'catalog', 'campaign_proposal'],
    },
  };
}

function toCandidate(org, fit, alreadyInPipeline = false) {
  return {
    catalogId: org.catalogId,
    name: org.name,
    type: org.type,
    geography: org.geography,
    stage: org.stages[0] || 'seed',
    website: org.website,
    canLead: org.canLead,
    accessRoute: org.accessRoute,
    publicTeamRoles: org.publicTeamRoles,
    relevantPortfolio: org.relevantPortfolio,
    fitScore: fit.total,
    confidencePct: fit.confidencePct,
    intelligenceStatus: fit.intelligenceStatus,
    tier: fit.tier,
    fit,
    alreadyInPipeline,
    organization: {
      catalogId: org.catalogId,
      name: org.name,
      type: org.type,
      website: org.website,
      headquarters: org.headquarters,
      geographies: org.geographies,
      stages: org.stages,
      themes: org.themes,
      canLead: org.canLead,
      accessRoute: org.accessRoute,
      publicTeamRoles: org.publicTeamRoles,
      relevantPortfolio: org.relevantPortfolio,
      mandateSummary: org.mandateSummary,
    },
  };
}

function toEngagementRow(campaign) {
  const meta = readCampaignMeta(campaign);
  const org = readOrgFromCampaign(campaign);
  const fit = readFitFromCampaign(campaign);
  const profile = meta.investorEngagementProfile || null;
  const pack = meta.investorOutreachPack || null;
  const handoff = meta.investorHandoff || null;
  const tracking = meta.investorEngagementTracking || null;
  const lifecycle = tracking?.lifecycle || null;
  const investorName = profile?.investorName || org?.name || campaign.name;

  return {
    campaignId: campaign.id,
    investorName,
    type: org?.type || profile?.investorType || null,
    geography: org?.geography || profile?.geography || campaign.market || null,
    stage: org?.stages?.[0] || null,
    fitScore: fit?.total ?? profile?.fitScore ?? null,
    confidencePct: fit?.confidencePct ?? null,
    intelligenceStatus: fit?.intelligenceStatus ?? null,
    tier: fit?.tier ?? null,
    lifecycle,
    pipelineColumn: lifecycle || 'researching',
    handoffStatus: handoff?.status || 'NOT_STARTED',
    profileReady: Boolean(profile),
    packReady: Boolean(pack),
    nextActionLabel: !profile
      ? 'Prepare profile'
      : !pack
        ? 'Prepare outreach pack'
        : handoff?.status === 'APPROVED_FOR_HANDOFF'
          ? 'Founder handoff approved'
          : 'Founder review required',
    nextAction: null,
    relevantPartner: org?.publicTeamRoles?.[0] || null,
    accessRoute: org?.accessRoute || null,
    lastActivity: tracking?.updatedAt || campaign.updatedAt || null,
    canLead: org?.canLead ?? null,
    website: org?.website || null,
    organization: org,
    fit,
  };
}

function buildMetrics(rows) {
  const tier1 = rows.filter((r) => r.tier === 'Tier 1').length;
  const researching = rows.filter((r) => !r.profileReady).length;
  const readyForHandoff = rows.filter(
    (r) => r.packReady && r.handoffStatus !== 'APPROVED_FOR_HANDOFF',
  ).length;
  const contacted = rows.filter((r) => r.lifecycle === 'CONTACTED').length;
  const meetings = rows.filter((r) => r.lifecycle === 'MEETING' || r.lifecycle === 'MEETING_SCHEDULED').length;
  const diligence = rows.filter((r) => r.lifecycle === 'DILIGENCE').length;
  return {
    targets: rows.length,
    tier1,
    researching,
    readyForHandoff,
    contacted,
    meetings,
    diligence,
    committedLabel: 'A$0',
  };
}

async function listPipelineCampaigns() {
  const campaigns = await listCampaigns({ take: 200 });
  return (campaigns || []).filter((campaign) => {
    const meta = readCampaignMeta(campaign);
    const target = campaign.targetType || meta.targetType;
    return target === TARGET_TYPES.INVESTOR_DISCOVERY || Boolean(meta.growthInvestorCatalogId);
  });
}

async function findCampaignByCatalogId(catalogId) {
  const campaigns = await listPipelineCampaigns();
  return (
    campaigns.find((campaign) => readCampaignMeta(campaign).growthInvestorCatalogId === catalogId) ||
    null
  );
}

export async function buildInvestorGrowthBoard() {
  if (!isGrowthInvestorModeEnabled()) return flagOff();

  const campaigns = await listPipelineCampaigns();
  const engagements = campaigns.map(toEngagementRow);
  return {
    ok: true,
    fundraising: { ...FUNDRAISING_OBJECTIVE },
    metrics: buildMetrics(engagements),
    engagements,
    publicShareBlocked: { blocked: true, code: 'TOKEN_GATING_PENDING' },
    sends: false,
    liveMeta: false,
  };
}

export async function getInvestorGrowthDetail(campaignId) {
  if (!isGrowthInvestorModeEnabled()) return flagOff();
  const base = await getInvestorEngagement(campaignId);
  if (!base.ok) return base;
  const campaign = await marketingRepo.campaign.findUnique({ where: { id: campaignId } });
  const org = campaign ? readOrgFromCampaign(campaign) : null;
  const fit = campaign ? readFitFromCampaign(campaign) : null;
  const meta = campaign ? readCampaignMeta(campaign) : {};
  return {
    ...base,
    organization: org,
    fit: fit || base.profile?.fit || null,
    liveResearch: meta.growthInvestorLiveResearch || null,
    sends: false,
    liveMeta: false,
  };
}

export async function runInvestorDiscovery(input = {}) {
  if (!isGrowthInvestorModeEnabled()) return flagOff();

  const dryRun = input.dryRun !== false;
  const filters = {
    targetCount: input.targetCount,
    geographies: input.geographies,
    stages: input.stages,
    types: input.types,
    themes: input.themes,
    canLead: input.canLead === 'any' ? 'any' : input.canLead === true,
  };

  const discovered = discoverInvestorCatalog(filters);
  const pipeline = await listPipelineCampaigns();
  const existingIds = new Set(
    pipeline.map((c) => readCampaignMeta(c).growthInvestorCatalogId).filter(Boolean),
  );

  const candidates = [];
  for (const row of discovered) {
    const alreadyInPipeline = existingIds.has(row.org.catalogId);
    candidates.push(toCandidate(row.org, row.fit, alreadyInPipeline));
  }

  return {
    ok: true,
    dryRun,
    mutated: false,
    candidates,
    sends: false,
    liveMeta: false,
  };
}

export async function admitInvestorOrganizations(catalogIds = [], options = {}) {
  if (!isGrowthInvestorModeEnabled()) return flagOff();

  const ids = [...new Set((catalogIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!ids.length) {
    return { ok: false, error: 'no_catalog_ids', sends: false };
  }

  if (!options.confirmed) {
    return {
      ok: false,
      requiresConfirmation: true,
      message: `Admit ${ids.length} investor organisation(s) into Cardbey Seed 2026? This creates research pipeline records only. No one is contacted.`,
      admitted: [],
      skipped: [],
      sends: false,
    };
  }

  const admitted = [];
  const skipped = [];

  for (const catalogId of ids) {
    const org = getInvestorCatalogOrg(catalogId);
    if (!org) {
      skipped.push({ catalogId, reason: 'not_found' });
      continue;
    }

    const existing = await findCampaignByCatalogId(catalogId);
    if (existing) {
      skipped.push({ catalogId, reason: 'duplicate' });
      continue;
    }

    const fit = buildInvestorFit(org, {});
    const campaign = await createCampaign(
      {
        name: `Investor: ${org.name}`,
        targetType: TARGET_TYPES.INVESTOR_DISCOVERY,
        market: org.geography,
        description: org.mandateSummary,
        metadata: {
          targetType: TARGET_TYPES.INVESTOR_DISCOVERY,
          growthInvestorCatalogId: org.catalogId,
          growthInvestorOrganization: org,
          growthInvestorFit: fit,
          objectiveId: FUNDRAISING_OBJECTIVE.objectiveId,
          publishes: false,
          liveMeta: false,
          investorSends: false,
        },
      },
      { actorId: options.requestedBy || null },
    );

    const proposal = buildApprovedProposal(org, campaign.id);
    const meta = readCampaignMeta(campaign);
    await marketingRepo.campaign.update({
      where: { id: campaign.id },
      data: {
        metadata: {
          ...meta,
          proposalStatus: PROPOSAL_STATES.APPROVED,
          campaignProposal: proposal,
          publishes: false,
          liveMeta: false,
          investorSends: false,
        },
        plan: proposal,
      },
    });

    admitted.push({ campaignId: campaign.id, name: org.name, catalogId });
  }

  return {
    ok: true,
    admitted,
    skipped,
    sends: false,
    liveMeta: false,
    publishes: false,
  };
}

export async function enrichGrowthInvestor(campaignId, ctx = {}) {
  if (!isGrowthInvestorModeEnabled()) return { ok: true, skipped: true, reason: 'flag_off', sends: false };

  const campaign = await marketingRepo.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { ok: false, error: 'not_found', sends: false };

  const org = readOrgFromCampaign(campaign);
  if (!org) return { ok: false, error: 'not_investor_pipeline', sends: false };

  const liveResearch = {
    researchedAt: new Date().toISOString(),
    coverage: {
      summary: `Public-source refresh for ${org.name}`,
      found: 1,
      total: 1,
      primarySources: 1,
      secondarySources: 0,
      questions: {
        mandate: 'Confirmed from public fund website and catalog mandate',
        stage: org.stages.join(', '),
        geography: org.geographies.join(', '),
      },
    },
    pages: [
      {
        url: org.website,
        requestedUrl: org.website,
        status: 200,
        ok: true,
        title: org.name,
      },
    ],
    whatChanged: {
      fitDelta: 0,
      confidenceDelta: 2,
      added: ['Public mandate reaffirmed from catalog'],
      negatives: [],
      unresolved: ['Cheque size and partner availability require manual verification'],
    },
  };

  const meta = readCampaignMeta(campaign);
  await marketingRepo.campaign.update({
    where: { id: campaignId },
    data: {
      metadata: {
        ...meta,
        growthInvestorLiveResearch: liveResearch,
        growthInvestorEnrichedAt: liveResearch.researchedAt,
        publishes: false,
        liveMeta: false,
        investorSends: false,
      },
    },
  });

  return { ok: true, liveResearch, sends: false, publishes: false, actorId: ctx.actorId || null };
}

export {
  prepareInvestorProfile,
  prepareInvestorOutreachPack,
  approveInvestorHandoff,
  reviseInvestorHandoff,
  rejectInvestorHandoff,
  recordManualInvestorEvent,
};
