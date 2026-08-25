/**
 * Campaign proposal service (Phase 1F).
 * Approved opportunity → evidence-linked proposal. Never publishes or schedules.
 */

import { appendMarketingAudit } from '../marketingOperator/audit.js';
import { createCampaign, listCampaigns } from '../marketingOperator/campaignService.js';
import { marketingRepo } from '../marketingOperator/repository.js';
import { PERMISSIONS } from '../marketingOperator/constants.js';
import { createTrackedHandoff } from './trackedHandoff.js';
import { assertApprovalSeparation, approvalStamp } from './approvalDuties.js';
import { TARGET_TYPES } from './constants.js';
import { OPPORTUNITY_STATES } from './researchContract.js';
import {
  PROPOSAL_KIND,
  PROPOSAL_STATES,
  attachReadiness,
  buildProposalFromOpportunity,
  defaultClaimsRiskNotes,
  editableProposalPatch,
  evaluateProposalReadiness,
  readProposalFromCampaign,
} from './campaignProposalContract.js';

async function loadOpportunity(id) {
  const row = await marketingRepo.researchOpportunity.findUnique({
    where: { id },
    include: {
      objective: true,
      task: { include: { evidence: true } },
    },
  }).catch(() => marketingRepo.researchOpportunity.findUnique({ where: { id } }));
  if (!row) return null;
  let evidence = row.task?.evidence || [];
  if (!evidence.length && Array.isArray(row.evidenceIds) && row.evidenceIds.length) {
    evidence = [];
    for (const eid of row.evidenceIds) {
      const ev = await marketingRepo.researchEvidence.findUnique({ where: { id: eid } }).catch(() => null);
      if (ev) evidence.push(ev);
    }
  }
  return { ...row, evidence };
}

function publicResult(campaign, proposal, extra = {}) {
  const ready = attachReadiness(proposal);
  return {
    ok: true,
    campaign,
    proposal: ready,
    readiness: ready.readinessState,
    publishes: false,
    scheduled: false,
    liveMeta: false,
    channelExecution: false,
    ...extra,
  };
}

async function persistProposal(campaignId, proposal, extraCampaign = {}) {
  const existing = await marketingRepo.campaign.findUnique({ where: { id: campaignId } });
  if (!existing) return null;
  const meta = existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
  const nextProposal = attachReadiness({
    ...proposal,
    provenance: {
      ...(proposal.provenance || {}),
      campaignId,
    },
    updatedAt: new Date().toISOString(),
  });
  const data = {
    name: extraCampaign.name ?? existing.name,
    description: extraCampaign.description !== undefined ? extraCampaign.description : existing.description,
    language: nextProposal.language ?? existing.language,
    market: nextProposal.market ?? existing.market,
    audience: nextProposal.audienceHypothesis
      ? { label: nextProposal.audienceHypothesis }
      : existing.audience,
    cta: nextProposal.ctaLabel ?? existing.cta,
    destination: nextProposal.destination ?? existing.destination,
    successCriteria: nextProposal.successMetricHypothesis ?? existing.successCriteria,
    plan: {
      kind: PROPOSAL_KIND,
      ...nextProposal,
    },
    metadata: {
      ...meta,
      preparedFromOpportunityId: nextProposal.opportunityId || meta.preparedFromOpportunityId,
      proposalStatus: nextProposal.status,
      provenance: nextProposal.provenance,
      campaignProposal: nextProposal,
      publishes: false,
      scheduled: false,
      liveMeta: false,
      channelExecution: false,
    },
    ...extraCampaign.data,
  };
  return marketingRepo.campaign.update({ where: { id: campaignId }, data });
}

function issueTrackedUrl(campaignId, proposal) {
  const dest = proposal.destination;
  if (!dest?.available || !dest.url) {
    return {
      ...proposal,
      attribution: { ...(proposal.attribution || {}), issued: false, trackedUrl: null },
    };
  }
  if (proposal.targetType === TARGET_TYPES.INVESTOR_DISCOVERY) {
    return {
      ...proposal,
      ctaLabel: null,
      destination: { ...dest, available: false, url: null, reason: 'investor_destination_unavailable' },
      attribution: { ...(proposal.attribution || {}), issued: false, trackedUrl: null },
    };
  }
  const tracked = createTrackedHandoff({
    baseUrl: dest.url,
    campaignId,
    channel: proposal.channelSuggestion || 'facebook',
    intent: proposal.intent,
    language: proposal.language,
    utmCampaign: campaignId,
    utmContent: proposal.opportunityId,
  });
  return {
    ...proposal,
    attribution: {
      ...(proposal.attribution || {}),
      issued: Boolean(tracked.ok),
      trackedUrl: tracked.ok ? tracked.url : null,
      params: tracked.ok ? tracked.params : proposal.attribution?.params,
      eventHint: tracked.eventHint || 'CARDBEY_HANDOFF',
    },
    destination: {
      ...dest,
      trackedUrl: tracked.ok ? tracked.url : null,
    },
  };
}

export async function getCampaignProposal(campaignId) {
  const campaign = await marketingRepo.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { ok: false, error: 'not_found' };
  const proposal = readProposalFromCampaign(campaign);
  if (!proposal) {
    return { ok: false, error: 'proposal_not_found', campaign, publishes: false, liveMeta: false };
  }
  return publicResult(campaign, proposal);
}

export async function listCampaignProposals(query = {}) {
  const campaigns = await listCampaigns({ take: query.take || 50 });
  const rows = [];
  for (const campaign of campaigns || []) {
    const proposal = readProposalFromCampaign(campaign);
    if (!proposal) continue;
    if (query.status && proposal.status !== query.status) continue;
    const ready = attachReadiness(proposal);
    rows.push({
      campaignId: campaign.id,
      name: campaign.name,
      status: proposal.status,
      targetType: proposal.targetType,
      purpose: proposal.purpose || null,
      opportunityId: proposal.opportunityId,
      objectiveId: proposal.objectiveId,
      readiness: ready.readinessState,
      liveMeta: false,
    });
  }
  return { ok: true, proposals: rows, liveMeta: false };
}

/**
 * Create or return the evidence-linked proposal DRAFT for an approved opportunity.
 */
export async function prepareCampaignProposalFromOpportunity(id, ctx = {}) {
  const opportunity = await loadOpportunity(id);
  if (!opportunity) return { ok: false, error: 'not_found' };
  if (opportunity.status !== OPPORTUNITY_STATES.APPROVED) {
    return { ok: false, error: 'opportunity_not_approved' };
  }

  if (opportunity.campaignId) {
    const existing = await marketingRepo.campaign.findUnique({ where: { id: opportunity.campaignId } }).catch(() => null);
    if (existing) {
      const proposal = readProposalFromCampaign(existing) || attachReadiness(buildProposalFromOpportunity(opportunity, {
        campaignId: existing.id,
        actorId: ctx.actorId,
      }));
      return publicResult(existing, proposal, {
        opportunity,
        reused: true,
        note: 'Existing proposal returned. Human edits were not overwritten.',
      });
    }
  }

  const seed = buildProposalFromOpportunity(opportunity, { actorId: ctx.actorId });
  const campaign = await createCampaign(
    {
      name: `Proposal: ${seed.workingTitle}`.slice(0, 120),
      objectiveId: seed.objectiveId,
      targetType: seed.targetType,
      channel: seed.channelSuggestion || 'facebook',
      market: seed.market,
      language: seed.language,
      status: 'DRAFT',
      description: opportunity.summary,
      audience: seed.audienceHypothesis ? { label: seed.audienceHypothesis } : null,
      cta: seed.ctaLabel,
      destination: seed.destination,
      successCriteria: seed.successMetricHypothesis,
      plan: { kind: PROPOSAL_KIND, ...seed },
      metadata: {
        preparedFromOpportunityId: id,
        proposalStatus: PROPOSAL_STATES.DRAFT,
        provenance: seed.provenance,
        campaignProposal: seed,
        publishes: false,
        scheduled: false,
        liveMeta: false,
        channelExecution: false,
      },
    },
    ctx,
  );

  const withTrack = issueTrackedUrl(campaign.id, {
    ...seed,
    provenance: { ...seed.provenance, campaignId: campaign.id },
  });
  const updated = await persistProposal(campaign.id, withTrack, {
    name: `Proposal: ${withTrack.workingTitle}`.slice(0, 120),
  });
  const linked = await marketingRepo.researchOpportunity.update({
    where: { id },
    data: { campaignId: campaign.id },
  });
  await appendMarketingAudit({
    entityType: 'MarketingCampaign',
    entityId: campaign.id,
    action: 'prepare_campaign_proposal',
    actorId: ctx.actorId,
    campaignId: campaign.id,
    metadata: {
      opportunityId: id,
      taskId: withTrack.researchTaskId,
      objectiveId: withTrack.objectiveId,
      evidenceIds: withTrack.provenance?.sourceFactIds || [],
      publishes: false,
    },
  }).catch(() => {});
  return publicResult(updated || campaign, withTrack, { opportunity: linked, reused: false });
}

export async function patchCampaignProposal(campaignId, patch = {}, ctx = {}) {
  const loaded = await getCampaignProposal(campaignId);
  if (!loaded.ok) return loaded;
  const edits = editableProposalPatch(patch);
  let next = {
    ...loaded.proposal,
    ...edits,
  };
  if (edits.workingTitle || edits.bodyDraft || edits.angleWhy) {
    next.claimsRisk = defaultClaimsRiskNotes(
      { ...next, suggestedAngle: next.angleWhy, title: next.workingTitle, language: next.language },
      `${next.workingTitle || ''}\n${next.bodyDraft || ''}`,
    );
  }
  if (loaded.proposal.status === PROPOSAL_STATES.APPROVED) {
    next.status = PROPOSAL_STATES.NEEDS_REVISION;
  }
  next = issueTrackedUrl(campaignId, next);
  const campaign = await persistProposal(campaignId, next);
  await appendMarketingAudit({
    entityType: 'MarketingCampaign',
    entityId: campaignId,
    action: 'patch_campaign_proposal',
    actorId: ctx.actorId,
    campaignId,
    metadata: { keys: Object.keys(edits), publishes: false },
  }).catch(() => {});
  return publicResult(campaign, next);
}

export async function submitCampaignProposal(campaignId, ctx = {}) {
  const loaded = await getCampaignProposal(campaignId);
  if (!loaded.ok) return loaded;
  if (![PROPOSAL_STATES.DRAFT, PROPOSAL_STATES.NEEDS_REVISION].includes(loaded.proposal.status)) {
    return { ok: false, error: 'invalid_proposal_status', status: loaded.proposal.status };
  }
  const readiness = evaluateProposalReadiness(loaded.proposal);
  if (readiness.blockers.includes('claims_blocked')) {
    return { ok: false, error: 'claims_blocked', readiness, publishes: false };
  }
  const next = { ...loaded.proposal, status: PROPOSAL_STATES.READY_FOR_REVIEW };
  const campaign = await persistProposal(campaignId, next);
  await appendMarketingAudit({
    entityType: 'MarketingCampaign',
    entityId: campaignId,
    action: 'submit_campaign_proposal',
    actorId: ctx.actorId,
    campaignId,
    toStatus: PROPOSAL_STATES.READY_FOR_REVIEW,
    metadata: { publishes: false },
  }).catch(() => {});
  return publicResult(campaign, next);
}

export async function approveCampaignProposal(campaignId, ctx = {}) {
  const loaded = await getCampaignProposal(campaignId);
  if (!loaded.ok) return loaded;
  if (loaded.proposal.status !== PROPOSAL_STATES.READY_FOR_REVIEW) {
    return { ok: false, error: 'proposal_not_in_review', status: loaded.proposal.status };
  }
  const separation = assertApprovalSeparation({
    createdBy: loaded.proposal.createdBy || loaded.campaign?.createdBy,
    actorId: ctx.actorId,
  });
  if (!separation.ok) return { ...separation, publishes: false, liveMeta: false };
  const stamp = approvalStamp(ctx.actorId);
  const next = {
    ...loaded.proposal,
    status: PROPOSAL_STATES.APPROVED,
    approvedBy: ctx.actorId,
    approvedAt: stamp.approvedAt.toISOString(),
  };
  const campaign = await persistProposal(campaignId, next, {
    data: {
      reviewedBy: stamp.reviewedBy,
      approvedBy: stamp.approvedBy,
      reviewedAt: stamp.reviewedAt,
      approvedAt: stamp.approvedAt,
      status: 'DRAFT',
    },
  });
  await appendMarketingAudit({
    entityType: 'MarketingCampaign',
    entityId: campaignId,
    action: 'approve_campaign_proposal',
    actorId: ctx.actorId,
    campaignId,
    toStatus: PROPOSAL_STATES.APPROVED,
    metadata: {
      publishes: false,
      liveMeta: false,
      channelExecution: false,
      selfApproveOverride: separation.selfApproveOverride || false,
    },
  }).catch(() => {});
  return publicResult(campaign, next, {
    permission: PERMISSIONS.MARKETING_APPROVER,
    note: 'Proposal approved. Not publishable. Channel execution is later.',
  });
}

export async function reviseCampaignProposal(campaignId, ctx = {}) {
  const loaded = await getCampaignProposal(campaignId);
  if (!loaded.ok) return loaded;
  const next = { ...loaded.proposal, status: PROPOSAL_STATES.NEEDS_REVISION };
  const campaign = await persistProposal(campaignId, next);
  await appendMarketingAudit({
    entityType: 'MarketingCampaign',
    entityId: campaignId,
    action: 'revise_campaign_proposal',
    actorId: ctx.actorId,
    campaignId,
    toStatus: PROPOSAL_STATES.NEEDS_REVISION,
    metadata: { publishes: false },
  }).catch(() => {});
  return publicResult(campaign, next);
}

export async function getCampaignProposalReadiness(campaignId) {
  const loaded = await getCampaignProposal(campaignId);
  if (!loaded.ok) return loaded;
  return {
    ok: true,
    campaignId,
    readiness: loaded.readiness,
    proposalStatus: loaded.proposal.status,
    campaignStatus: loaded.campaign?.status,
    publishes: false,
    liveMeta: false,
    channelExecution: false,
  };
}
