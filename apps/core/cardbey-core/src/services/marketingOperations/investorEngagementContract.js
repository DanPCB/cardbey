/**
 * Investor engagement profile / outreach / handoff contract (Phase 1G).
 * Presentation strategy on MarketingCampaign — not a fundraising CRM.
 * SOURCE_FACT and AI_INTERPRETATION stay separate. No send. No Meta.
 */

import { createHash, randomBytes } from 'node:crypto';
import { TARGET_TYPES } from './constants.js';
import { EVIDENCE_KIND } from './researchContract.js';
import { CANONICAL_INVESTOR_FACTS, FACT_STATUS, factsForProjection } from './canonicalInvestorFacts.js';

export const INVESTOR_PROFILE_KIND = 'INVESTOR_ENGAGEMENT_PROFILE_V1';
export const INVESTOR_OUTREACH_KIND = 'INVESTOR_OUTREACH_PACK_V1';
export const INVESTOR_PROJECTION_KIND = 'INVESTOR_LANDING_PROJECTION_V1';

export const INVESTOR_HANDOFF_STATES = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  PROFILE_READY: 'PROFILE_READY',
  PACK_READY: 'PACK_READY',
  APPROVED_FOR_HANDOFF: 'APPROVED_FOR_HANDOFF',
  REJECTED: 'REJECTED',
  NEEDS_REVISION: 'NEEDS_REVISION',
});

export const INVESTOR_PROVENANCE_CHAIN = Object.freeze([
  'objective',
  'research_task',
  'evidence',
  'opportunity',
  'campaign_proposal',
  'investor_engagement_profile',
  'outreach_pack',
  'founder_approval',
  'INVESTOR_HANDOFF',
]);

export function hashInvestorToken(raw) {
  return createHash('sha256').update(String(raw)).digest('hex');
}

export function issueInvestorToken() {
  const token = randomBytes(24).toString('base64url');
  return { token, tokenHash: hashInvestorToken(token) };
}

export function splitEvidence(opportunity = {}, proposal = {}) {
  const rows = [
    ...(Array.isArray(opportunity.evidence) ? opportunity.evidence : []),
    ...(Array.isArray(proposal.sourceEvidence) ? proposal.sourceEvidence : []),
  ];
  const seen = new Set();
  const sourceFacts = [];
  const interpretations = [];
  for (const row of rows) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    if (row.kind === EVIDENCE_KIND.AI_INTERPRETATION) interpretations.push(row);
    else if (row.kind === EVIDENCE_KIND.SOURCE_FACT) sourceFacts.push(row);
  }
  return { sourceFacts, interpretations };
}

function geographyFrom(opportunity, proposal) {
  return proposal.market || opportunity.market || opportunity.objective?.market || 'global';
}

function heuristicFit(opportunity = {}) {
  const n = Number(opportunity.confidence);
  const score = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.4;
  return {
    fitScore: score,
    fitRationaleKind: EVIDENCE_KIND.AI_INTERPRETATION,
    fitRationale:
      'Heuristic fit from catalog evidence and opportunity confidence. Not a verified investment recommendation.',
  };
}

function anglesFor(opportunity = {}, proposal = {}, geo) {
  const primary =
    proposal.suggestedAngle ||
    opportunity.suggestedAngle ||
    'Cardbey as an under-development AI business platform — research interpretation only.';
  const vn = /vn|viet/i.test(String(geo));
  const au = /au|australia/i.test(String(geo));
  const secondary = [];
  if (vn) secondary.push('Vietnam SME activation and multilingual EN/VI surfaces');
  if (au) secondary.push('Australia ↔ Vietnam market bridge');
  if (!secondary.length) secondary.push('Resource discovery and business activation (working thesis)');
  return { primaryAngle: primary, secondaryAngles: secondary };
}

export function buildInvestorEngagementProfile({ opportunity = {}, proposal = {}, campaignId, actorId } = {}) {
  const { sourceFacts, interpretations } = splitEvidence(opportunity, proposal);
  const geo = geographyFrom(opportunity, proposal);
  const fit = heuristicFit(opportunity);
  const angles = anglesFor(opportunity, proposal, geo);
  const emphasize = factsForProjection({ includeDraft: true })
    .filter((f) => {
      if (f.key === 'languages_en_vi') return true;
      if (f.key === 'under_development') return true;
      if (f.key === 'positioning_accelerator') return true;
      if (/vn/i.test(geo) && (f.category === 'Vietnam' || f.key === 'wedge_au_vn')) return true;
      if (/au/i.test(geo) && (f.category === 'Australia' || f.key === 'wedge_au_vn')) return true;
      return f.key === 'company_name';
    })
    .map((f) => f.key);
  return {
    kind: INVESTOR_PROFILE_KIND,
    campaignId: campaignId || proposal.provenance?.campaignId || null,
    opportunityId: opportunity.id || proposal.opportunityId || null,
    objectiveId: proposal.objectiveId || opportunity.objectiveId || null,
    researchTaskId: proposal.researchTaskId || opportunity.taskId || null,
    investorName: opportunity.title || proposal.workingTitle || 'Unnamed investor theme',
    investorType: opportunity.opportunityType || 'INVESTOR_THEME',
    geography: geo,
    stageFocus: null,
    sectorFocus: opportunity.audience || proposal.audienceHypothesis || null,
    ...fit,
    ...angles,
    emphasize,
    deEmphasize: ['traction_metrics', 'raise_terms', 'financials', 'live_meta_publishing'],
    likelyQuestions: [
      'What is actually live versus under development?',
      'Why Australia and Vietnam rather than a single market?',
    ],
    likelyObjections: [
      'Traction is not yet a verified fundraising fact.',
      'Working positioning is not a completed category claim.',
    ],
    suggestedAsk: null,
    suggestedNextAction: 'Founder reviews profile and outreach pack. No external send.',
    landingProfileKey: String(opportunity.id || campaignId || 'theme').slice(0, 40),
    evidenceRefs: sourceFacts.map((e) => ({
      id: e.id,
      kind: EVIDENCE_KIND.SOURCE_FACT,
      sourceTitle: e.sourceTitle || null,
      sourceUrl: e.sourceUrl || null,
    })),
    interpretationRefs: interpretations.map((e) => ({
      id: e.id,
      kind: EVIDENCE_KIND.AI_INTERPRETATION,
      sourceTitle: e.sourceTitle || null,
    })),
    interpretationNotes: [
      'Fit score, angles, questions, and objections are AI/heuristic interpretation — not source facts.',
      'Canonical restricted facts (raise, financials) stay omitted.',
    ],
    provenance: {
      ...(proposal.provenance || {}),
      chain: [...INVESTOR_PROVENANCE_CHAIN],
      opportunityId: opportunity.id || proposal.opportunityId,
      campaignId: campaignId || proposal.provenance?.campaignId || null,
    },
    readinessState: {
      evidenceLinked: sourceFacts.length > 0,
      interpretationSeparated: true,
      livePublishReady: false,
      outreachSendable: false,
    },
    createdBy: actorId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function buildCanonicalLandingProjection() {
  return buildLandingProjection({
    investorName: null,
    emphasize: ['company_name', 'under_development', 'positioning_accelerator', 'wedge_au_vn'],
    likelyQuestions: [
      'What is actually live versus under development?',
      'Why Australia and Vietnam rather than a single market?',
    ],
  });
}

export function buildLandingProjection(profile = {}) {
  const emphasize = new Set(profile.emphasize || []);
  const facts = factsForProjection({ includeDraft: true }).filter(
    (f) => f.status !== FACT_STATUS.RESTRICTED && f.status !== FACT_STATUS.MISSING,
  );
  const ordered = [
    ...facts.filter((f) => emphasize.has(f.key)),
    ...facts.filter((f) => !emphasize.has(f.key)),
  ];
  const unique = [];
  const seen = new Set();
  for (const f of ordered) {
    if (seen.has(f.key)) continue;
    seen.add(f.key);
    unique.push({
      key: f.key,
      category: f.category,
      status: f.status,
      title: f.title,
      body: f.body,
    });
  }
  return {
    kind: INVESTOR_PROJECTION_KIND,
    investorName: profile.investorName,
    headline: unique.find((f) => f.key === 'company_name')?.title || 'Cardbey',
    subheadline: unique.find((f) => f.key === 'under_development')?.body || null,
    sections: unique,
    questions: profile.likelyQuestions || [],
    restrictedOmitted: CANONICAL_INVESTOR_FACTS.filter(
      (f) => f.status === FACT_STATUS.RESTRICTED || f.status === FACT_STATUS.MISSING,
    ).map((f) => f.key),
    inventsFacts: false,
    livePublishReady: false,
  };
}

export function buildOutreachPack(profile = {}, projection = {}) {
  return {
    kind: INVESTOR_OUTREACH_KIND,
    investorProfileId: profile.campaignId,
    approvalState: 'DRAFT',
    watermark: 'DRAFT — FOUNDER APPROVAL REQUIRED',
    introSummary: `${profile.investorName || 'Investor theme'}: ${profile.primaryAngle}`,
    outreachDraft: [
      'DRAFT — FOUNDER APPROVAL REQUIRED',
      '',
      `Theme: ${profile.investorName}`,
      `Angle: ${profile.primaryAngle}`,
      '',
      'This is an internal draft. It must not be sent, posted, or submitted until the founder approves handoff.',
      'No confidential financials, cap table, or restricted facts are included.',
    ].join('\n'),
    shortPitch: profile.primaryAngle,
    meetingTalkingPoints: [
      ...(profile.secondaryAngles || []),
      ...(profile.likelyQuestions || []),
    ],
    evidenceSummary: (profile.evidenceRefs || []).map((e) => e.sourceTitle || e.id),
    investorPageProjection: projection,
    sends: false,
    liveMeta: false,
    updatedAt: new Date().toISOString(),
  };
}

export function evaluateInvestorReadiness({ proposal, profile, pack, handoff } = {}) {
  const blockers = [];
  if (!proposal) blockers.push('proposal_required');
  if (proposal?.targetType !== TARGET_TYPES.INVESTOR_DISCOVERY && proposal?.purpose !== 'INVESTOR') {
    blockers.push('not_investor_proposal');
  }
  if (proposal && proposal.liveMeta) blockers.push('investor_meta_forbidden');
  if (proposal?.destination?.available) blockers.push('investor_public_cta_forbidden');
  if (!profile) blockers.push('profile_required');
  if (profile && !(profile.evidenceRefs || []).length) blockers.push('source_evidence_required');
  if (!pack) blockers.push('outreach_pack_required');
  return {
    profileReady: Boolean(profile) && !blockers.includes('source_evidence_required'),
    packReady: Boolean(pack),
    handoffApproved: handoff?.status === INVESTOR_HANDOFF_STATES.APPROVED_FOR_HANDOFF,
    livePublishReady: false,
    canSend: false,
    blockers,
  };
}
