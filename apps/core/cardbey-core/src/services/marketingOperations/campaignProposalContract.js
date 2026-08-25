/**
 * Campaign proposal contract (Phase 1F).
 * Operational object on MarketingCampaign — not generated ads copy alone.
 * Provenance: Objective → Research Task → Evidence → Opportunity → Campaign Proposal.
 * Approve does not publish.
 */

import { TARGET_TYPES } from './constants.js';
import { EVIDENCE_KIND } from './researchContract.js';
import { resolveDestinationForIntent } from './destinationGuard.js';
import { validateProductClaims } from '../marketingOperator/claimValidator.js';
import { Features } from '../../config/features.js';

export const PROPOSAL_KIND = 'CAMPAIGN_PROPOSAL_V1';

export const PROPOSAL_STATES = Object.freeze({
  DRAFT: 'DRAFT',
  READY_FOR_REVIEW: 'READY_FOR_REVIEW',
  APPROVED: 'APPROVED',
  NEEDS_REVISION: 'NEEDS_REVISION',
});

export const PROVENANCE_CHAIN = Object.freeze([
  'objective',
  'research_task',
  'evidence',
  'opportunity',
  'campaign_proposal',
]);

export function purposeFromOpportunity(opportunity = {}) {
  if (opportunity.targetType === TARGET_TYPES.INVESTOR_DISCOVERY) return 'INVESTOR';
  const type = String(opportunity.opportunityType || '');
  if (type === 'PARTNERSHIP' || type === 'SUPPLIER' || type === 'STRATEGIC_PARTNERSHIP') {
    return 'PARTNERSHIP';
  }
  return 'USER_ACQUISITION';
}

export function intentFromOpportunity(opportunity = {}) {
  if (opportunity.targetType === TARGET_TYPES.INVESTOR_DISCOVERY) return 'HUMAN_FOLLOWUP';
  const type = String(opportunity.opportunityType || '');
  if (type === 'GLOBAL_LIVE') return 'GLOBAL_LIVE_EOI';
  if (type === 'MARKET_ENTRY') return 'MARKET_ENTRY';
  if (type === 'PARTNERSHIP' || type === 'SUPPLIER' || type === 'STRATEGIC_PARTNERSHIP') {
    return 'PARTNERSHIP';
  }
  if (type === 'CONTENT_TOPIC' || type === 'COMMUNITY') return 'CREATE_BUSINESS';
  return 'CREATE_BUSINESS';
}

export function ctaLabelForDestination(destination, targetType) {
  if (targetType === TARGET_TYPES.INVESTOR_DISCOVERY || !destination?.available) {
    return null;
  }
  if (destination.key === 'global_live') return 'Register interest for Global Live';
  if (destination.key === 'for_sellers') return 'Open Cardbey for sellers';
  return 'Create a business on Cardbey';
}

export function defaultSuccessHypothesis(targetType) {
  if (targetType === TARGET_TYPES.INVESTOR_DISCOVERY) {
    return {
      primary: 'INVESTOR_HANDOFF',
      downstream: [],
      note: 'Founder-approved fundraising handoff only. Not a public marketing CTA. Not CARDBEY_HANDOFF.',
    };
  }
  return {
    primary: 'CARDBEY_HANDOFF',
    downstream: ['SIGNUP', 'BUSINESS_CREATED', 'BUSINESS_CLAIMED'],
    note: 'Hypothesis only. Not a measured outcome until first-party attribution is observed.',
  };
}

export function defaultCreativeRequirements(opportunity = {}, language = 'en') {
  const langs = language === 'vi' ? ['vi', 'en'] : language === 'en' ? ['en', 'vi'] : [language || 'en'];
  return {
    languages: langs,
    format: 'short_social_post',
    channelSuggestion: opportunity.suggestedChannel || 'facebook',
    mustInclude: ['Truthful Cardbey capability framing', 'Under-development language when claiming platform completeness'],
    mustNotInclude: [
      'Invented live Meta verification',
      'Named private investors or personal contact data',
      'Republished scraped pages',
      'Guaranteed outcomes or fake statistics',
    ],
  };
}

export function defaultClaimsRiskNotes(opportunity = {}, copyText = '') {
  const claims = validateProductClaims(copyText || opportunity.suggestedAngle || opportunity.title || 'draft', opportunity.language || 'en');
  const notes = [
    'AI interpretation on the opportunity is not a source fact.',
    'Public catalog URLs are not consent to contact anyone.',
    'This proposal cannot publish to Facebook or any channel in Phase 1F.',
  ];
  if (opportunity.targetType === TARGET_TYPES.INVESTOR_DISCOVERY) {
    notes.push('Investor-discovery proposals are research-only. No CRM, outreach, or ExecutiveLead.');
  }
  return {
    validatorStatus: claims.status,
    validatorOk: claims.ok,
    findings: claims.findings || [],
    notes,
  };
}

export function buildProvenance(opportunity = {}, campaignId = null) {
  const evidence = Array.isArray(opportunity.evidence) ? opportunity.evidence : [];
  const fromIds = Array.isArray(opportunity.evidenceIds) ? opportunity.evidenceIds : [];
  const evidenceIds = [...new Set([...fromIds, ...evidence.map((e) => e.id).filter(Boolean)])];
  const sourceFactIds = evidence.filter((e) => e.kind === EVIDENCE_KIND.SOURCE_FACT).map((e) => e.id);
  const interpretationIds = evidence
    .filter((e) => e.kind === EVIDENCE_KIND.AI_INTERPRETATION)
    .map((e) => e.id);
  return {
    objectiveId: opportunity.objectiveId || opportunity.objective?.id || null,
    researchTaskId: opportunity.taskId || opportunity.task?.id || null,
    evidenceIds,
    sourceFactIds: sourceFactIds.length ? sourceFactIds : evidenceIds,
    interpretationIds,
    opportunityId: opportunity.id || null,
    campaignId: campaignId || opportunity.campaignId || null,
    chain: [...PROVENANCE_CHAIN],
  };
}

export function sourceEvidenceRefs(opportunity = {}) {
  const evidence = Array.isArray(opportunity.evidence) ? opportunity.evidence : [];
  return evidence
    .filter((e) => e.kind === EVIDENCE_KIND.SOURCE_FACT)
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      sourceUrl: e.sourceUrl || null,
      sourceTitle: e.sourceTitle || null,
      publishedAt: e.publishedAt || null,
      freshness: e.freshness || null,
      summary: e.summary || null,
    }));
}

/**
 * Build a campaign proposal document from an approved opportunity.
 * @param {object} opportunity
 * @param {{ campaignId?: string|null, actorId?: string|null }} [opts]
 */
export function buildProposalFromOpportunity(opportunity, opts = {}) {
  const targetType = opportunity.targetType || TARGET_TYPES.USER_ACQUISITION;
  const language = opportunity.task?.language || opportunity.objective?.language || opportunity.language || 'en';
  const market = opportunity.market || opportunity.objective?.market || null;
  const intent = intentFromOpportunity(opportunity);
  const destination = resolveDestinationForIntent({ intent, targetType });
  const workingTitle = String(opportunity.title || 'Untitled proposal').slice(0, 160);
  const bodyDraft = [
    opportunity.suggestedAngle,
    opportunity.summary,
    'Cardbey is under development. This is a campaign proposal, not a live advertisement.',
  ]
    .filter(Boolean)
    .join('\n\n');
  const copyForClaims = `${workingTitle}\n${bodyDraft}`;
  const campaignId = opts.campaignId || opportunity.campaignId || null;

  return {
    kind: PROPOSAL_KIND,
    status: PROPOSAL_STATES.DRAFT,
    provenance: buildProvenance(opportunity, campaignId),
    objectiveId: opportunity.objectiveId || opportunity.objective?.id || null,
    objectiveName: opportunity.objective?.name || null,
    researchTaskId: opportunity.taskId || opportunity.task?.id || null,
    opportunityId: opportunity.id,
    opportunityType: opportunity.opportunityType || null,
    targetType,
    audienceHypothesis: opportunity.audience || null,
    market,
    language,
    sourceEvidence: sourceEvidenceRefs(opportunity),
    angleWhy: opportunity.rationale || opportunity.suggestedAngle || null,
    purpose: purposeFromOpportunity(opportunity),
    channelSuggestion: opportunity.suggestedChannel || 'facebook',
    workingTitle,
    bodyDraft,
    creativeRequirements: defaultCreativeRequirements(opportunity, language),
    intent,
    ctaLabel: ctaLabelForDestination(destination, targetType),
    destination: {
      ...destination,
      liveMeta: false,
    },
    attribution: {
      planned: true,
      issued: false,
      params: {
        utmSource: opportunity.suggestedChannel || 'facebook',
        utmMedium: 'social',
        utmCampaign: campaignId || opportunity.id,
        intent,
        language,
        channel: opportunity.suggestedChannel || 'facebook',
      },
      trackedUrl: null,
    },
    successMetricHypothesis: defaultSuccessHypothesis(targetType),
    claimsRisk: defaultClaimsRiskNotes(opportunity, copyForClaims),
    readinessState: null,
    publishes: false,
    scheduled: false,
    liveMeta: false,
    channelExecution: false,
    createdBy: opts.actorId || null,
    updatedAt: new Date().toISOString(),
  };
}

export function evaluateProposalReadiness(proposal = {}) {
  const blockers = [];
  const provenance = proposal.provenance || {};
  const sourceFacts = Array.isArray(proposal.sourceEvidence) ? proposal.sourceEvidence : [];
  const dest = proposal.destination || {};
  const investor =
    proposal.targetType === TARGET_TYPES.INVESTOR_DISCOVERY || proposal.purpose === 'INVESTOR';

  if (!proposal.workingTitle) blockers.push('working_title_required');
  if (!proposal.audienceHypothesis) blockers.push('audience_hypothesis_required');
  if (!proposal.market) blockers.push('market_required');
  if (!proposal.angleWhy) blockers.push('angle_why_required');
  if (!proposal.channelSuggestion) blockers.push('channel_suggestion_required');
  if (!provenance.objectiveId || !provenance.opportunityId) blockers.push('provenance_incomplete');
  if (!sourceFacts.length) blockers.push('source_evidence_required');
  if (proposal.claimsRisk?.validatorOk === false && proposal.claimsRisk?.validatorStatus === 'BLOCKED') {
    blockers.push('claims_blocked');
  }
  if (!investor && !dest.available) blockers.push('destination_unavailable');
  if (investor && dest.available) blockers.push('investor_public_cta_forbidden');

  const proposalComplete = !blockers.includes('working_title_required')
    && !blockers.includes('audience_hypothesis_required')
    && !blockers.includes('angle_why_required');
  const humanApproved = proposal.status === PROPOSAL_STATES.APPROVED;

  return {
    proposalComplete,
    evidenceLinked: sourceFacts.length > 0,
    provenanceComplete: Boolean(provenance.objectiveId && provenance.researchTaskId && provenance.opportunityId),
    destinationReady: investor ? !dest.available : Boolean(dest.available),
    claimsAcceptable: proposal.claimsRisk?.validatorStatus !== 'BLOCKED',
    humanApproved,
    livePublishReady: false,
    channelExecutionReady: false,
    blockers,
    note: 'Phase 1F: an approved proposal is not publishable. Channel execution is later.',
    livePublishingFlag: Features.marketingOperator.livePublishingV1 === true,
  };
}

export function attachReadiness(proposal) {
  const next = { ...proposal, readinessState: evaluateProposalReadiness(proposal) };
  return next;
}

export function readProposalFromCampaign(campaign) {
  if (!campaign) return null;
  const meta = campaign.metadata && typeof campaign.metadata === 'object' ? campaign.metadata : {};
  const fromMeta = meta.campaignProposal;
  if (fromMeta?.kind === PROPOSAL_KIND) return fromMeta;
  if (campaign.plan?.kind === PROPOSAL_KIND) return campaign.plan;
  if (campaign.plan?.campaignProposal?.kind === PROPOSAL_KIND) return campaign.plan.campaignProposal;
  return null;
}

export function editableProposalPatch(input = {}) {
  const out = {};
  if (input.workingTitle != null) out.workingTitle = String(input.workingTitle).slice(0, 160);
  if (input.bodyDraft != null) out.bodyDraft = String(input.bodyDraft).slice(0, 8000);
  if (input.audienceHypothesis != null) out.audienceHypothesis = String(input.audienceHypothesis).slice(0, 400);
  if (input.angleWhy != null) out.angleWhy = String(input.angleWhy).slice(0, 4000);
  if (input.channelSuggestion != null) out.channelSuggestion = String(input.channelSuggestion).slice(0, 80);
  if (input.ctaLabel !== undefined) out.ctaLabel = input.ctaLabel ? String(input.ctaLabel).slice(0, 120) : null;
  if (input.market != null) out.market = String(input.market).slice(0, 80);
  if (input.language != null) out.language = String(input.language).slice(0, 16);
  if (input.operatorNotes != null) out.operatorNotes = String(input.operatorNotes).slice(0, 2000);
  if (input.successMetricNotes != null) {
    out.successMetricHypothesis = {
      ...(input.successMetricHypothesis || {}),
      note: String(input.successMetricNotes).slice(0, 1000),
    };
  }
  return out;
}
