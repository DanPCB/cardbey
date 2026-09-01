/**
 * Fundraising Campaign V1 service — in-memory primary for tests; Prisma dual-write when available.
 * Consumes ADMIT_TO_FUNDRAISING_CAMPAIGN_V1 with explicit human confirmation.
 * No external contact, email send, or document sharing.
 */
import { getInvestorCatalogOrg, buildInvestorFit } from '../executiveGrowth/investorOrganizationCatalog.js';
import {
  buildCapitalCampaignHandoff,
  calibrateCardbeySeedAgainstCohort,
} from '../marketIntent/capital/capitalResourceNetworkService.js';
import { projectInvestorToMarketGraphNode } from '../marketIntent/capital/projectInvestorToMarketGraphNode.js';
import {
  buildCardbeySeed2026MarketGraphNode,
  buildCardbeySeed2026SeekerProfile,
  CARDBEY_SEED_2026_NODE_ID,
  getCardbeySeed2026MissionRecord,
} from '../marketIntent/capital/cardbeySeed2026Mission.js';
import { evaluateReciprocalMatchPair } from '../marketIntent/evaluateReciprocalMatch.js';
import { buildQualifiedCapitalOpportunity } from '../marketIntent/capital/qualifyCapitalPair.js';
import { getCapitalCohortById, CARDBEY_SEED_CALIBRATION_CANDIDATE_IDS } from '../marketIntent/capital/capitalInvestorResearchCohort.js';
import type { CapitalCampaignHandoffContract } from '../marketIntent/capital/capitalTypes.js';
import {
  FUNDRAISING_CAMPAIGN_ID_CARDBEY_SEED_2026,
  FUNDRAISING_CAMPAIGN_KEY_CARDBEY_SEED_2026,
  FUNDRAISING_CAMPAIGN_STATES,
  FUNDRAISING_EVENTS,
  FUNDRAISING_TARGET_LIFECYCLE,
  SUITCASE_SEED_DOCUMENTS,
  canTransitionLifecycle,
  newId,
  type AssessmentProvenanceBundle,
} from './fundraisingCampaignContracts.js';
import {
  CARDBEY_ACQUISITION_THESIS,
  CARDBEY_CORE_USP,
  classifySuitcaseArtifact,
  recommendOperatorAction,
  seedInvestorQuestionBank,
} from './campaignPrepContent.js';
import {
  fundraisingPrismaReady,
  hydrateCardbeySeedFromPrisma,
  persistCampaignRow,
  persistDocumentRow,
  persistDraftRow,
  persistEventRow,
  persistGapRow,
  persistTargetBundle,
} from './fundraisingCampaignPersistence.js';

type CampaignRecord = {
  id: string;
  campaignKey: string;
  name: string;
  companyLabel: string | null;
  companyNodeId: string | null;
  fundraisingObjectiveId: string;
  proposedTargetAmountAud: number | null;
  stage: string | null;
  proposedInstrument: string | null;
  proposedTermsJson: unknown;
  targetMarketsJson: unknown;
  targetInvestorRegionsJson: unknown;
  ownerUserId: string | null;
  state: string;
  createdAt: string;
  updatedAt: string;
};

type TargetRecord = {
  id: string;
  campaignId: string;
  catalogId: string | null;
  investorName: string;
  investorNodeId: string | null;
  companyNodeId: string | null;
  marketMatchPairKey: string | null;
  lifecycle: string;
  lifecycleHistoryJson: Array<{ from: string; to: string; at: string; by?: string | null; reason?: string }>;
  assessmentsJson: AssessmentProvenanceBundle;
  dossierJson: Record<string, unknown>;
  handoffJson: CapitalCampaignHandoffContract | null;
  unresolvedGapsJson: string[];
  admittingOperatorId: string | null;
  admittedAt: string;
  updatedAt: string;
};

type GapRecord = {
  id: string;
  targetId: string;
  field: string;
  whyItMatters: string;
  currentEvidenceState: string;
  requestedResearch: string | null;
  status: string;
  provenanceJson: unknown;
  resolutionJson: unknown;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

type DocRecord = {
  id: string;
  campaignId: string;
  category: string;
  title: string;
  version: string;
  status: string;
  visibility: string;
  evidenceStatus: string;
  contentRef: string | null;
  metadataJson: unknown;
  createdAt: string;
  updatedAt: string;
};

type DraftRecord = {
  id: string;
  targetId: string;
  draftType: string;
  status: string;
  bodyText: string;
  markedAsAi: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
  metadataJson: unknown;
  createdAt: string;
  updatedAt: string;
};

type EventRecord = {
  id: string;
  campaignId: string;
  targetId: string | null;
  eventType: string;
  actorId: string | null;
  payloadJson: unknown;
  occurredAt: string;
};

const mem = {
  campaigns: new Map<string, CampaignRecord>(),
  targets: new Map<string, TargetRecord>(),
  gaps: new Map<string, GapRecord>(),
  docs: new Map<string, DocRecord>(),
  drafts: new Map<string, DraftRecord>(),
  events: [] as EventRecord[],
};

function nowIso() {
  return new Date().toISOString();
}

function prismaReady(): boolean {
  return fundraisingPrismaReady();
}

function appendEvent(campaignId: string, eventType: string, payload: unknown = null, targetId: string | null = null, actorId: string | null = null) {
  const ev: EventRecord = {
    id: newId('evt'),
    campaignId,
    targetId,
    eventType,
    actorId,
    payloadJson: payload,
    occurredAt: nowIso(),
  };
  mem.events.push(ev);
  void (async () => {
    const ok = await waitForCampaignPersist(campaignId);
    if (ok) await persistEventRow(ev);
  })();
  return ev;
}

let hydratePromise: Promise<void> | null = null;
const campaignPersistWaiters = new Map<string, Promise<boolean>>();

async function waitForCampaignPersist(campaignId: string) {
  const waiter = campaignPersistWaiters.get(campaignId);
  if (waiter) return waiter;
  const c = mem.campaigns.get(campaignId);
  if (c) return queueCampaignPersist(c);
  return false;
}

function queueCampaignPersist(campaign: CampaignRecord) {
  const run = (async () => {
    const result = await persistCampaignRow(campaign);
    if (!result.ok || !result.id) return false;
    // Adopt DB id if a prior row existed under the same campaignKey
    if (result.id !== campaign.id) {
      mem.campaigns.delete(campaign.id);
      const adopted = { ...campaign, id: result.id };
      mem.campaigns.set(adopted.id, adopted);
      for (const d of [...mem.docs.values()].filter((x) => x.campaignId === campaign.id)) {
        d.campaignId = result.id;
      }
      for (const e of mem.events.filter((x) => x.campaignId === campaign.id)) {
        e.campaignId = result.id;
      }
      for (const t of [...mem.targets.values()].filter((x) => x.campaignId === campaign.id)) {
        t.campaignId = result.id;
      }
      campaignPersistWaiters.set(result.id, run);
      campaign = adopted;
    }
    for (const d of [...mem.docs.values()].filter((x) => x.campaignId === campaign.id)) {
      await persistDocumentRow(d);
    }
    for (const e of mem.events.filter(
      (x) => x.campaignId === campaign.id && x.eventType === FUNDRAISING_EVENTS.DOCUMENT_REGISTERED,
    )) {
      await persistEventRow(e);
    }
    return true;
  })();
  campaignPersistWaiters.set(campaign.id, run);
  return run;
}

function mapIso(v: unknown): string {
  if (!v) return nowIso();
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/** Load Prisma campaign into memory when process memory is empty (soft-fail). */
export async function ensureFundraisingHydrated() {
  if (mem.campaigns.size > 0) return;
  if (!prismaReady()) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      const bundle = await hydrateCardbeySeedFromPrisma(FUNDRAISING_CAMPAIGN_KEY_CARDBEY_SEED_2026);
      if (!bundle || mem.campaigns.size > 0) return;
      const c = bundle.campaign;
      mem.campaigns.set(c.id, {
        id: c.id,
        campaignKey: c.campaignKey,
        name: c.name,
        companyLabel: c.companyLabel,
        companyNodeId: c.companyNodeId,
        fundraisingObjectiveId: c.fundraisingObjectiveId,
        proposedTargetAmountAud: c.proposedTargetAmountAud,
        stage: c.stage,
        proposedInstrument: c.proposedInstrument,
        proposedTermsJson: c.proposedTermsJson,
        targetMarketsJson: c.targetMarketsJson,
        targetInvestorRegionsJson: c.targetInvestorRegionsJson,
        ownerUserId: c.ownerUserId,
        state: c.state,
        createdAt: mapIso(c.createdAt),
        updatedAt: mapIso(c.updatedAt),
      });
      for (const d of bundle.docs) {
        mem.docs.set(d.id, {
          id: d.id,
          campaignId: d.campaignId,
          category: d.category,
          title: d.title,
          version: d.version,
          status: d.status,
          visibility: d.visibility,
          evidenceStatus: d.evidenceStatus,
          contentRef: d.contentRef,
          metadataJson: d.metadataJson,
          createdAt: mapIso(d.createdAt),
          updatedAt: mapIso(d.updatedAt),
        });
      }
      for (const t of bundle.targets) {
        mem.targets.set(t.id, {
          id: t.id,
          campaignId: t.campaignId,
          catalogId: t.catalogId,
          investorName: t.investorName,
          investorNodeId: t.investorNodeId,
          companyNodeId: t.companyNodeId,
          marketMatchPairKey: t.marketMatchPairKey,
          lifecycle: t.lifecycle,
          lifecycleHistoryJson: t.lifecycleHistoryJson || [],
          assessmentsJson: t.assessmentsJson || ({} as any),
          dossierJson: t.dossierJson || {},
          handoffJson: t.handoffJson || null,
          unresolvedGapsJson: t.unresolvedGapsJson || [],
          admittingOperatorId: t.admittingOperatorId,
          admittedAt: mapIso(t.admittedAt),
          updatedAt: mapIso(t.updatedAt),
        });
      }
      for (const g of bundle.gaps) {
        mem.gaps.set(g.id, {
          id: g.id,
          targetId: g.targetId,
          field: g.field,
          whyItMatters: g.whyItMatters,
          currentEvidenceState: g.currentEvidenceState,
          requestedResearch: g.requestedResearch,
          status: g.status,
          provenanceJson: g.provenanceJson,
          resolutionJson: g.resolutionJson,
          createdAt: mapIso(g.createdAt),
          updatedAt: mapIso(g.updatedAt),
          resolvedAt: g.resolvedAt ? mapIso(g.resolvedAt) : null,
        });
      }
      for (const d of bundle.drafts) {
        mem.drafts.set(d.id, {
          id: d.id,
          targetId: d.targetId,
          draftType: d.draftType,
          status: d.status,
          bodyText: d.bodyText,
          markedAsAi: d.markedAsAi,
          approvedAt: d.approvedAt ? mapIso(d.approvedAt) : null,
          approvedBy: d.approvedBy,
          metadataJson: d.metadataJson,
          createdAt: mapIso(d.createdAt),
          updatedAt: mapIso(d.updatedAt),
        });
      }
      for (const e of bundle.events) {
        mem.events.push({
          id: e.id,
          campaignId: e.campaignId,
          targetId: e.targetId,
          eventType: e.eventType,
          actorId: e.actorId,
          payloadJson: e.payloadJson,
          occurredAt: mapIso(e.occurredAt),
        });
      }
    })().finally(() => {
      hydratePromise = null;
    });
  }
  await hydratePromise;
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join('::');
}

function buildAssessments(params: {
  reciprocalBand: string;
  reciprocalMatch?: any;
  capitalQualification?: any;
  investorFit?: any;
}): AssessmentProvenanceBundle {
  const fit = params.investorFit;
  return {
    reciprocal: {
      band: params.reciprocalBand,
      matcherVersion: params.reciprocalMatch?.matcherVersion ?? null,
      evidenceConfidence: params.reciprocalMatch?.evidenceConfidence ?? null,
      matchReasons: params.reciprocalMatch?.matchReasons ?? [],
      conflicts: params.reciprocalMatch?.conflicts ?? [],
      unknowns: params.reciprocalMatch?.unknowns ?? [],
    },
    capitalQualification: params.capitalQualification
      ? {
          band: params.capitalQualification.band,
          compatibleFactors: params.capitalQualification.compatibleFactors,
          contradictions: params.capitalQualification.contradictions,
          unknowns: params.capitalQualification.unknowns,
          rankingReasons: params.capitalQualification.rankingReasons,
          reviewPriority: params.capitalQualification.reviewPriority,
        }
      : null,
    investorFit: fit
      ? {
          kind: 'INVESTOR_FIT_V1',
          total: fit.total ?? null,
          confidencePct: fit.confidencePct ?? null,
          tier: fit.tier ?? null,
          intelligenceStatus: fit.intelligenceStatus ?? null,
          whyItFits: fit.whyItFits ?? [],
          potentialConcerns: fit.potentialConcerns ?? [],
        }
      : null,
  };
}

function buildDossier(params: {
  org: any;
  capitalProfile: any;
  assessments: AssessmentProvenanceBundle;
  gaps: string[];
  handoff: CapitalCampaignHandoffContract | null;
}) {
  const { org, capitalProfile, assessments, gaps, handoff } = params;
  return {
    identity: {
      name: org.name,
      catalogId: org.catalogId,
      type: org.type,
      website: org.website,
      headquarters: org.headquarters,
    },
    publicTeam: org.publicTeamRoles || [],
    geography: org.geographies || [],
    stages: org.stages || [],
    chequeEvidence: {
      minAud: capitalProfile?.chequeMinAud ?? null,
      maxAud: capitalProfile?.chequeMaxAud ?? null,
      state: capitalProfile?.chequeMinAud == null && capitalProfile?.chequeMaxAud == null ? 'UNKNOWN' : 'SOURCE_FACT',
    },
    thesis: org.mandateSummary,
    relevantPortfolio: org.relevantPortfolio || [],
    leadFollow: {
      canLead: org.canLead,
      evidenceKind: 'AI_INTERPRETATION',
    },
    assessments: {
      reciprocal: assessments.reciprocal,
      capitalQualification: assessments.capitalQualification,
      investorFit: assessments.investorFit,
    },
    likelyFitReasons: [
      ...(assessments.capitalQualification?.compatibleFactors || []),
      ...(assessments.investorFit?.whyItFits || []),
      ...(assessments.reciprocal?.matchReasons || []).slice(0, 3),
    ],
    contradictions: [
      ...(assessments.capitalQualification?.contradictions || []),
      ...(assessments.reciprocal?.conflicts || []),
      ...(assessments.investorFit?.potentialConcerns || []),
    ],
    unknowns: [
      ...(assessments.capitalQualification?.unknowns || []),
      ...(assessments.reciprocal?.unknowns || []),
      ...gaps,
    ],
    researchGaps: gaps,
    sourceEvidence: {
      SOURCE_FACT: capitalProfile?.sourceFacts || [],
      AI_INTERPRETATION: capitalProfile?.interpretations || [],
    },
    introductionPaths: org.accessRoute
      ? [{ path: org.accessRoute, evidenceKind: 'SOURCE_FACT', note: 'Public access route from catalog — not a private contact' }]
      : [],
    campaignHistory: [],
    nextAction: 'Review research gaps; do not contact until founder approves outreach draft',
    handoffSummary: handoff
      ? {
          kind: handoff.kind,
          reciprocalBand: handoff.reciprocalBand,
          capitalQualificationBand: handoff.capitalQualificationBand,
          unresolvedGaps: handoff.unresolvedGaps,
        }
      : null,
  };
}

function seedGapsForTarget(targetId: string, capitalProfile: any, unresolved: string[]): GapRecord[] {
  const created: GapRecord[] = [];
  const add = (field: string, why: string, requested: string) => {
    const gap: GapRecord = {
      id: newId('gap'),
      targetId,
      field,
      whyItMatters: why,
      currentEvidenceState: 'UNKNOWN',
      requestedResearch: requested,
      status: 'OPEN',
      provenanceJson: { createdFrom: 'admission', unresolvedHints: unresolved },
      resolutionJson: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      resolvedAt: null,
    };
    mem.gaps.set(gap.id, gap);
    created.push(gap);
    return gap;
  };

  if (capitalProfile?.chequeMinAud == null || capitalProfile?.chequeMaxAud == null) {
    add(
      'chequeRange',
      'Cheque range determines whether A$3M seed is a single-cheque or syndicate conversation',
      'Locate public cheque / check-size evidence from fund website or reputable public sources only',
    );
  }
  if (!capitalProfile?.stages?.length) {
    add('stages', 'Stage fit is required for capital qualification', 'Confirm public stage focus');
  }
  for (const u of unresolved) {
    if (/cheque/i.test(u) && created.some((g) => g.field === 'chequeRange')) continue;
    if (/ownership/i.test(u)) {
      add('ownership_expectations', 'Ownership expectations affect term discussion readiness', 'Find public ownership/board policy if any');
    }
  }
  return created;
}

function seedSuitcase(campaignId: string, options?: { persist?: boolean }) {
  const shouldPersist = options?.persist !== false;
  for (const doc of SUITCASE_SEED_DOCUMENTS) {
    const row: DocRecord = {
      id: newId('doc'),
      campaignId,
      category: doc.category,
      title: doc.title,
      version: 'v1',
      status: 'DRAFT',
      visibility: 'INTERNAL',
      evidenceStatus: doc.evidenceStatus,
      contentRef: null,
      metadataJson: {
        externalShareBlocked: true,
        placeholderOnly: true,
        readinessNote: 'Registry placeholder is not a READY investor artifact',
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    mem.docs.set(row.id, row);
    if (shouldPersist) {
      void persistDocumentRow(row);
      appendEvent(campaignId, FUNDRAISING_EVENTS.DOCUMENT_REGISTERED, {
        documentId: row.id,
        title: row.title,
        placeholderOnly: true,
        readiness: 'MISSING_OR_DRAFT_PLACEHOLDER',
      });
    } else {
      // Memory-only until campaign row is persisted (FK order)
      mem.events.push({
        id: newId('evt'),
        campaignId,
        targetId: null,
        eventType: FUNDRAISING_EVENTS.DOCUMENT_REGISTERED,
        actorId: null,
        payloadJson: {
          documentId: row.id,
          title: row.title,
          placeholderOnly: true,
          readiness: 'MISSING_OR_DRAFT_PLACEHOLDER',
        },
        occurredAt: nowIso(),
      });
    }
  }
}

/** Ensure Cardbey Seed 2026 campaign exists (PREPARING by default — not auto ACTIVE). */
export function ensureCardbeySeed2026Campaign(options?: { ownerUserId?: string | null }): CampaignRecord {
  const existing = [...mem.campaigns.values()].find((c) => c.campaignKey === FUNDRAISING_CAMPAIGN_KEY_CARDBEY_SEED_2026);
  if (existing) return existing;

  const mission = getCardbeySeed2026MissionRecord();
  const campaign: CampaignRecord = {
    id: FUNDRAISING_CAMPAIGN_ID_CARDBEY_SEED_2026,
    campaignKey: FUNDRAISING_CAMPAIGN_KEY_CARDBEY_SEED_2026,
    name: 'Cardbey Seed 2026',
    companyLabel: mission.companyLabel || 'Cardbey',
    companyNodeId: CARDBEY_SEED_2026_NODE_ID,
    fundraisingObjectiveId: 'cardbey-seed-2026',
    proposedTargetAmountAud: 3_000_000,
    stage: 'seed',
    proposedInstrument: 'SAFE (proposed — not executed)',
    proposedTermsJson: {
      ...mission.proposedTerms,
      distinction: 'PROPOSED',
      verified: false,
    },
    targetMarketsJson: ['marketplace', 'ai', 'saas', 'commerce', 'sme'],
    targetInvestorRegionsJson: ['au', 'sea'],
    ownerUserId: options?.ownerUserId ?? null,
    state: FUNDRAISING_CAMPAIGN_STATES.PREPARING,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  mem.campaigns.set(campaign.id, campaign);
  // Seed suitcase in memory first; persist campaign then docs/events (FK order)
  seedSuitcase(campaign.id, { persist: false });
  queueCampaignPersist(campaign);
  return campaign;
}

export function setCampaignState(campaignId: string, state: string, actorId?: string | null) {
  const campaign = mem.campaigns.get(campaignId);
  if (!campaign) return { ok: false as const, error: 'campaign_not_found' };
  if (!Object.values(FUNDRAISING_CAMPAIGN_STATES).includes(state as any)) {
    return { ok: false as const, error: 'invalid_state' };
  }
  // Do not infer ACTIVE merely because campaign exists — require explicit transition
  const from = campaign.state;
  campaign.state = state;
  campaign.updatedAt = nowIso();
  void persistCampaignRow(campaign).then(() => undefined);
  appendEvent(campaignId, FUNDRAISING_EVENTS.CAMPAIGN_STATE_CHANGED, { from, to: state }, null, actorId ?? null);
  return { ok: true as const, campaign };
}

export function getCampaignOverview(campaignKey = FUNDRAISING_CAMPAIGN_KEY_CARDBEY_SEED_2026) {
  const campaign = ensureCardbeySeed2026Campaign();
  const targets = [...mem.targets.values()].filter((t) => t.campaignId === campaign.id);
  const gaps = [...mem.gaps.values()].filter((g) => targets.some((t) => t.id === g.targetId) && g.status === 'OPEN');
  const docs = [...mem.docs.values()].filter((d) => d.campaignId === campaign.id);
  const lifecycleSummary: Record<string, number> = {};
  for (const t of targets) {
    lifecycleSummary[t.lifecycle] = (lifecycleSummary[t.lifecycle] || 0) + 1;
  }

  const suitcaseReadiness = docs.map((d) => {
    const c = classifySuitcaseArtifact(d);
    return { title: d.title, category: d.category, readiness: c.readiness, reason: c.reason };
  });
  const prep = {
    usp: CARDBEY_CORE_USP,
    acquisitionThesis: CARDBEY_ACQUISITION_THESIS,
    investorQuestions: getOrSeedInvestorQuestions(campaign.id),
  };

  const readyArtifacts = suitcaseReadiness.filter((s) => s.readiness === 'READY').length;
  appendEvent(campaign.id, FUNDRAISING_EVENTS.FUNDRAISING_CAMPAIGN_VIEWED, { admittedTargets: targets.length });

  return {
    campaign,
    admittedTargets: targets.length,
    lifecycleSummary,
    openResearchGaps: gaps.length,
    documentReadiness: {
      total: docs.length,
      draft: docs.filter((d) => d.status === 'DRAFT').length,
      ready: readyArtifacts,
      placeholders: docs.filter((d) => !d.contentRef).length,
      externalShareBlocked: true,
      note: 'Registry placeholder ≠ READY artifact',
    },
    suitcaseReadiness,
    prep,
    nextActions: [
      targets.length === 0 ? 'Review Wave 0 cohort and admit confirmed targets' : null,
      gaps.length ? `Resolve ${gaps.length} open research gap(s) with SOURCE_FACT only` : null,
      readyArtifacts === 0 ? 'Fundraising Suitcase has no READY artifacts — prepare real pitch/evidence packs' : null,
      campaign.state === FUNDRAISING_CAMPAIGN_STATES.PREPARING
        ? 'Activate campaign only when founder is ready (explicit state change)'
        : null,
      'Prepare outreach drafts as DRAFT — no send in V1',
    ].filter(Boolean),
    evidenceDistinction: {
      proposedTerms: 'PROPOSED',
      verifiedTraction: false,
      note: 'No fabricated Cardbey traction or investment probability',
    },
  };
}

const questionBankByCampaign = new Map<string, any[]>();

function getOrSeedInvestorQuestions(campaignId: string) {
  if (questionBankByCampaign.has(campaignId)) return questionBankByCampaign.get(campaignId);
  const seeded = seedInvestorQuestionBank();
  questionBankByCampaign.set(campaignId, seeded);
  return seeded;
}

export function recordInvestorQuestion(params: {
  campaignKey?: string;
  category: string;
  question: string;
  answerState: 'ANSWERED' | 'PARTIAL' | 'EVIDENCE_NEEDED' | 'NOT_YET_APPLICABLE';
  answerDraft?: string | null;
  evidenceNeeded?: string | null;
  actorId?: string | null;
}) {
  if (params.answerState === 'ANSWERED' && !params.answerDraft) {
    return { ok: false as const, error: 'answered_requires_content' };
  }
  const campaign = ensureCardbeySeed2026Campaign();
  const bank = getOrSeedInvestorQuestions(campaign.id);
  const row = {
    id: newId('iq'),
    category: params.category,
    question: params.question,
    answerState: params.answerState,
    answerDraft: params.answerDraft ?? null,
    evidenceNeeded: params.evidenceNeeded ?? null,
    epistemicStatus: params.answerState === 'EVIDENCE_NEEDED' ? 'UNKNOWN' : 'DIRECTION',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  bank.push(row);
  appendEvent(campaign.id, FUNDRAISING_EVENTS.INVESTOR_QUESTION_RECORDED, row, null, params.actorId ?? null);
  if (params.answerState === 'EVIDENCE_NEEDED') {
    appendEvent(campaign.id, FUNDRAISING_EVENTS.EVIDENCE_GAP_CREATED, {
      fromQuestionId: row.id,
      evidenceNeeded: params.evidenceNeeded,
    });
  }
  return { ok: true as const, question: row };
}

/**
 * Human-review Wave 0 cohort (~8–12) from Capital Resource Network calibration.
 * Does NOT auto-admit.
 */
export function getWave0HumanReviewCohort(limit = 12) {
  const calibration = calibrateCardbeySeedAgainstCohort();
  const preferred = new Set([
    ...CARDBEY_SEED_CALIBRATION_CANDIDATE_IDS,
    'inv_wavemaker_sea',
    'inv_insignia_sea',
    'inv_vertex_sea',
    'inv_500_global',
  ]);
  // Rank by reviewPriority; prefer VC over accelerator for institutional path but keep some program capital
  const ranked = [...calibration.rows].sort((a, b) => {
    const aPref = preferred.has(a.catalogId) ? 1 : 0;
    const bPref = preferred.has(b.catalogId) ? 1 : 0;
    if (bPref !== aPref) return bPref - aPref;
    if (a.investorType === 'VC' && b.investorType !== 'VC') return -1;
    if (b.investorType === 'VC' && a.investorType !== 'VC') return 1;
    return b.reviewPriority - a.reviewPriority;
  });

  return {
    campaignKey: FUNDRAISING_CAMPAIGN_KEY_CARDBEY_SEED_2026,
    note: 'Human-review candidates only — admission requires explicit confirmation. Rankings not manipulated for a desired fund.',
    candidates: ranked.slice(0, limit).map((row) => ({
      catalogId: row.catalogId,
      investorName: row.investorName,
      investorType: row.investorType,
      reciprocalBand: row.reciprocalBand,
      capitalBand: row.capitalBand,
      reviewPriority: row.reviewPriority,
      isCalibrationCandidate: row.isCalibrationCandidate,
      unknowns: row.unknowns,
      contradictions: row.contradictions,
      recommendedOperatorAction: recommendOperatorAction({
        reciprocalBand: row.reciprocalBand,
        capitalBand: row.capitalBand,
        investorType: row.investorType,
        openGaps: row.unknowns?.length || 0,
        contradictions: row.contradictions?.length || 0,
      }),
      assessmentsPreview: {
        reciprocal: row.reciprocalBand,
        capitalQualification: row.capitalBand,
      },
    })),
  };
}

export function admitFromCapitalHandoff(params: {
  handoff: CapitalCampaignHandoffContract;
  catalogId: string;
  confirmed: boolean;
  admittingOperatorId?: string | null;
  markMatchReviewed?: boolean;
}) {
  if (!params.confirmed) {
    return {
      ok: false as const,
      requiresConfirmation: true,
      message:
        'Admit this capital opportunity into Cardbey Seed 2026 fundraising campaign? Creates a TARGET record only. No investor is contacted.',
      sends: false,
    };
  }

  if (params.handoff?.kind !== 'ADMIT_TO_FUNDRAISING_CAMPAIGN_V1') {
    return { ok: false as const, error: 'invalid_handoff_kind', sends: false };
  }

  const campaign = ensureCardbeySeed2026Campaign({ ownerUserId: params.admittingOperatorId ?? null });
  const org = getInvestorCatalogOrg(params.catalogId) || getCapitalCohortById(params.catalogId);
  if (!org) return { ok: false as const, error: 'investor_not_found', sends: false };

  const dup = [...mem.targets.values()].find(
    (t) =>
      t.campaignId === campaign.id &&
      (t.catalogId === params.catalogId || t.investorNodeId === params.handoff.investorNodeId),
  );
  if (dup) {
    return { ok: false as const, error: 'duplicate_admission', existingTargetId: dup.id, sends: false };
  }

  const { node: investorNode, capitalProfile } = projectInvestorToMarketGraphNode(org as any);
  const companyNode = buildCardbeySeed2026MarketGraphNode();
  const reciprocal = evaluateReciprocalMatchPair(companyNode, investorNode);
  const opportunity = buildQualifiedCapitalOpportunity({
    companyNode,
    investorNode,
    reciprocal,
    companyProfile: buildCardbeySeed2026SeekerProfile(),
    investorProfile: capitalProfile,
  });
  const fit = buildInvestorFit(org, {
    geographies: ['au', 'sea'],
    stages: ['seed'],
    themes: ['marketplace', 'ai', 'saas', 'commerce', 'sme'],
    canLead: true,
  });

  const assessments = buildAssessments({
    reciprocalBand: reciprocal.reciprocalBand,
    reciprocalMatch: reciprocal,
    capitalQualification: opportunity.capitalQualification,
    investorFit: fit,
  });

  // Ensure three systems remain separate keys — never a merged score
  const handoff = {
    ...params.handoff,
    evidenceRefs: capitalProfile.evidenceRefs || params.handoff.evidenceRefs || [],
  };

  const target: TargetRecord = {
    id: newId('tgt'),
    campaignId: campaign.id,
    catalogId: org.catalogId,
    investorName: org.name,
    investorNodeId: params.handoff.investorNodeId || investorNode.nodeId,
    companyNodeId: params.handoff.companyNodeId || CARDBEY_SEED_2026_NODE_ID,
    marketMatchPairKey: pairKey(
      params.handoff.companyNodeId || CARDBEY_SEED_2026_NODE_ID,
      params.handoff.investorNodeId || investorNode.nodeId,
    ),
    lifecycle: FUNDRAISING_TARGET_LIFECYCLE.TARGET,
    lifecycleHistoryJson: [
      {
        from: 'NONE',
        to: FUNDRAISING_TARGET_LIFECYCLE.TARGET,
        at: nowIso(),
        by: params.admittingOperatorId ?? null,
        reason: 'confirmed_admission',
      },
    ],
    assessmentsJson: assessments,
    dossierJson: {},
    handoffJson: handoff,
    unresolvedGapsJson: [...(params.handoff.unresolvedGaps || []), ...(opportunity.capitalQualification.unknowns || [])],
    admittingOperatorId: params.admittingOperatorId ?? null,
    admittedAt: nowIso(),
    updatedAt: nowIso(),
  };

  target.dossierJson = buildDossier({
    org,
    capitalProfile,
    assessments,
    gaps: target.unresolvedGapsJson,
    handoff,
  });

  mem.targets.set(target.id, target);

  if (params.markMatchReviewed) {
    appendEvent(campaign.id, FUNDRAISING_EVENTS.CAPITAL_MATCH_REVIEWED, {
      pairKey: target.marketMatchPairKey,
      assessments,
    }, target.id, params.admittingOperatorId ?? null);
  }

  appendEvent(
    campaign.id,
    FUNDRAISING_EVENTS.INVESTOR_ADMITTED,
    {
      catalogId: org.catalogId,
      assessments,
      handoffKind: handoff.kind,
    },
    target.id,
    params.admittingOperatorId ?? null,
  );

  const gaps = seedGapsForTarget(target.id, capitalProfile, target.unresolvedGapsJson);
  for (const g of gaps) {
    appendEvent(campaign.id, FUNDRAISING_EVENTS.RESEARCH_GAP_CREATED, { gapId: g.id, field: g.field }, target.id, params.admittingOperatorId ?? null);
  }

  void (async () => {
    if (await waitForCampaignPersist(campaign.id)) {
      await persistTargetBundle({ target, gaps });
    }
  })();

  return {
    ok: true as const,
    campaignId: campaign.id,
    target,
    researchGaps: gaps,
    assessments,
    sends: false,
    externalShare: false,
  };
}

/** Convenience: build handoff from catalog id then admit with confirmation gate. */
export function admitCatalogInvestorToCampaign(params: {
  catalogId: string;
  confirmed: boolean;
  admittingOperatorId?: string | null;
}) {
  const org = getInvestorCatalogOrg(params.catalogId) || getCapitalCohortById(params.catalogId);
  if (!org) return { ok: false as const, error: 'investor_not_found', sends: false };

  const { node: investorNode, capitalProfile } = projectInvestorToMarketGraphNode(org as any);
  const companyNode = buildCardbeySeed2026MarketGraphNode();
  const reciprocal = evaluateReciprocalMatchPair(companyNode, investorNode);
  const opportunity = buildQualifiedCapitalOpportunity({
    companyNode,
    investorNode,
    reciprocal,
    companyProfile: buildCardbeySeed2026SeekerProfile(),
    investorProfile: capitalProfile,
  });
  const handoff = buildCapitalCampaignHandoff({ opportunity });

  return admitFromCapitalHandoff({
    handoff,
    catalogId: params.catalogId,
    confirmed: params.confirmed,
    admittingOperatorId: params.admittingOperatorId,
    markMatchReviewed: true,
  });
}

export function transitionTargetLifecycle(params: {
  targetId: string;
  to: string;
  actorId?: string | null;
  reason?: string;
}) {
  const target = mem.targets.get(params.targetId);
  if (!target) return { ok: false as const, error: 'target_not_found' };
  const check = canTransitionLifecycle(target.lifecycle, params.to);
  if (!check.ok) return { ok: false as const, error: check.reason || 'invalid_transition' };

  const from = target.lifecycle;
  target.lifecycleHistoryJson = [
    ...(target.lifecycleHistoryJson || []),
    { from, to: params.to, at: nowIso(), by: params.actorId ?? null, reason: params.reason },
  ];
  target.lifecycle = params.to;
  target.updatedAt = nowIso();
  if (Array.isArray((target.dossierJson as any)?.campaignHistory)) {
    (target.dossierJson as any).campaignHistory.push({ from, to: params.to, at: nowIso() });
  }

  appendEvent(target.campaignId, FUNDRAISING_EVENTS.LIFECYCLE_CHANGED, { from, to: params.to }, target.id, params.actorId ?? null);
  if (params.to === FUNDRAISING_TARGET_LIFECYCLE.MEETING) {
    appendEvent(target.campaignId, FUNDRAISING_EVENTS.MEETING_RECORDED, { phase: 'recorded' }, target.id, params.actorId ?? null);
  }
  if (params.to === FUNDRAISING_TARGET_LIFECYCLE.DILIGENCE) {
    appendEvent(target.campaignId, FUNDRAISING_EVENTS.DILIGENCE_STARTED, {}, target.id, params.actorId ?? null);
  }
  if (params.to === FUNDRAISING_TARGET_LIFECYCLE.PASSED) {
    appendEvent(target.campaignId, FUNDRAISING_EVENTS.INVESTOR_PASSED, {}, target.id, params.actorId ?? null);
  }
  if (params.to === FUNDRAISING_TARGET_LIFECYCLE.COMMITTED) {
    appendEvent(target.campaignId, FUNDRAISING_EVENTS.INVESTOR_COMMITTED, { note: 'Human-recorded commitment state — not an executed contract' }, target.id, params.actorId ?? null);
  }
  void (async () => {
    if (await waitForCampaignPersist(target.campaignId)) {
      await persistTargetBundle({ target });
    }
  })();
  return { ok: true as const, target };
}

export function resolveResearchGap(params: {
  gapId: string;
  resolution: {
    evidenceKind: 'SOURCE_FACT' | 'AI_INTERPRETATION';
    summary: string;
    sourceUrl?: string | null;
  };
  actorId?: string | null;
}) {
  const gap = mem.gaps.get(params.gapId);
  if (!gap) return { ok: false as const, error: 'gap_not_found' };
  if (params.resolution.evidenceKind === 'AI_INTERPRETATION') {
    return {
      ok: false as const,
      error: 'ai_interpretation_cannot_become_source_fact',
      message: 'Research resolution that updates evidence state requires SOURCE_FACT. AI interpretation may be recorded separately but cannot close the gap as fact.',
    };
  }
  gap.status = 'RESOLVED';
  gap.currentEvidenceState = 'SOURCE_FACT';
  gap.resolutionJson = {
    ...params.resolution,
    evidenceKind: 'SOURCE_FACT',
    resolvedBy: params.actorId ?? null,
  };
  gap.resolvedAt = nowIso();
  gap.updatedAt = nowIso();
  void (async () => {
    const campaignId = mem.targets.get(gap.targetId)?.campaignId;
    if (campaignId && (await waitForCampaignPersist(campaignId))) {
      await persistGapRow(gap);
    }
  })();
  const target = mem.targets.get(gap.targetId);
  if (target) {
    appendEvent(target.campaignId, FUNDRAISING_EVENTS.RESEARCH_GAP_RESOLVED, { gapId: gap.id, field: gap.field }, target.id, params.actorId ?? null);
  }
  return {
    ok: true as const,
    gap,
    next: {
      note: 'Call reevaluateTargetAfterEvidence to reproject + stale match + re-qualify',
      reprojectRequired: true,
      staleMatchRequired: true,
    },
  };
}

/**
 * After SOURCE_FACT resolution: reproject investor, mark prior graph match stale via replace admit,
 * re-run reciprocal + capital qualification + investor fit, update target dossier/assessments.
 * Never promotes AI_INTERPRETATION to SOURCE_FACT.
 */
export async function reevaluateTargetAfterEvidence(params: {
  targetId: string;
  field: string;
  fieldUpdates?: {
    chequeMinAud?: number | null;
    chequeMaxAud?: number | null;
    keepUnknownCheque?: boolean;
    stages?: string[];
  };
  sourceFact: { summary: string; sourceUrl?: string | null };
  actorId?: string | null;
}) {
  const target = mem.targets.get(params.targetId);
  if (!target) return { ok: false as const, error: 'target_not_found' };
  const catalogId = target.catalogId;
  if (!catalogId) return { ok: false as const, error: 'missing_catalog_id' };

  const orgBase = getInvestorCatalogOrg(catalogId) || getCapitalCohortById(catalogId);
  if (!orgBase) return { ok: false as const, error: 'investor_not_found' };

  const updates = params.fieldUpdates || {};
  const org = {
    ...orgBase,
    chequeMinAud:
      updates.keepUnknownCheque
        ? null
        : updates.chequeMinAud !== undefined
          ? updates.chequeMinAud
          : (orgBase as any).chequeMinAud ?? null,
    chequeMaxAud:
      updates.keepUnknownCheque
        ? null
        : updates.chequeMaxAud !== undefined
          ? updates.chequeMaxAud
          : (orgBase as any).chequeMaxAud ?? null,
    stages: updates.stages?.length ? updates.stages : orgBase.stages,
    evidenceAsOf: new Date().toISOString().slice(0, 10),
  };

  const { node: investorNode, capitalProfile } = projectInvestorToMarketGraphNode(org as any);
  // Append the new SOURCE_FACT into profile evidence
  capitalProfile.sourceFacts.push({
    kind: 'SOURCE_FACT',
    field: params.field,
    summary: params.sourceFact.summary,
    sourceUrl: params.sourceFact.sourceUrl ?? null,
    source: 'research_gap_resolution',
  });
  capitalProfile.evidenceRefs = [...capitalProfile.sourceFacts, ...capitalProfile.interpretations];

  // If cheque still unknown after resolution note, keep unknown fields
  if (updates.keepUnknownCheque || (org.chequeMinAud == null && org.chequeMaxAud == null)) {
    if (!capitalProfile.unknownFields.includes('cheque_min')) capitalProfile.unknownFields.push('cheque_min');
    if (!capitalProfile.unknownFields.includes('cheque_max')) capitalProfile.unknownFields.push('cheque_max');
  }

  const companyNode = buildCardbeySeed2026MarketGraphNode();
  const { launchpadPersistentMarketGraph } = await import(
    '../marketIntent/capital/persistentMarketGraphStore.js'
  );
  await launchpadPersistentMarketGraph.admit(
    {
      ...investorNode,
      domain: 'CAPITAL',
      resourceType: 'capital_provider',
      capitalProfile,
      provenance: {
        permissionBasis: 'public_catalog',
        researchResolution: params.sourceFact,
      },
    },
    { replace: true },
  );

  const reciprocal = evaluateReciprocalMatchPair(companyNode, investorNode);
  const opportunity = buildQualifiedCapitalOpportunity({
    companyNode,
    investorNode,
    reciprocal,
    companyProfile: buildCardbeySeed2026SeekerProfile(),
    investorProfile: capitalProfile,
  });
  const fit = buildInvestorFit(org, {
    geographies: ['au', 'sea'],
    stages: ['seed'],
    themes: ['marketplace', 'ai', 'saas', 'commerce', 'sme'],
    canLead: true,
  });
  const assessments = buildAssessments({
    reciprocalBand: reciprocal.reciprocalBand,
    reciprocalMatch: reciprocal,
    capitalQualification: opportunity.capitalQualification,
    investorFit: fit,
  });

  const priorBand = target.assessmentsJson?.reciprocal?.band;
  target.assessmentsJson = assessments;
  target.unresolvedGapsJson = opportunity.capitalQualification.unknowns || [];
  target.dossierJson = buildDossier({
    org,
    capitalProfile,
    assessments,
    gaps: target.unresolvedGapsJson,
    handoff: target.handoffJson,
  });
  (target.dossierJson as any).lastEvidenceDate = org.evidenceAsOf;
  (target.dossierJson as any).lastReevaluationAt = nowIso();
  target.updatedAt = nowIso();
  void (async () => {
    if (await waitForCampaignPersist(target.campaignId)) {
      await persistTargetBundle({ target });
    }
  })();

  appendEvent(
    target.campaignId,
    FUNDRAISING_EVENTS.CAPITAL_MATCH_REVIEWED,
    {
      reason: 'post_research_reevaluation',
      field: params.field,
      priorReciprocalBand: priorBand,
      reciprocalBand: assessments.reciprocal?.band,
      capitalBand: assessments.capitalQualification?.band,
      staleMatchHandled: true,
    },
    target.id,
    params.actorId ?? null,
  );

  return {
    ok: true as const,
    target,
    assessments,
    capitalProfile,
    reciprocalBand: reciprocal.reciprocalBand,
    priorReciprocalBand: priorBand,
    matchStaleReevaluated: true,
    sends: false,
  };
}

export function createOutreachDraft(params: {
  targetId: string;
  draftType: 'introduction_request' | 'initial_investor_email' | 'follow_up' | 'meeting_brief' | 'investor_pitch_notes';
  bodyText?: string;
  actorId?: string | null;
}) {
  const target = mem.targets.get(params.targetId);
  if (!target) return { ok: false as const, error: 'target_not_found' };

  const whyRelevant = [
    `Reciprocal band: ${target.assessmentsJson?.reciprocal?.band ?? '—'}`,
    `Capital qualification: ${target.assessmentsJson?.capitalQualification?.band ?? '—'}`,
    ...(target.assessmentsJson?.capitalQualification?.compatibleFactors || []).slice(0, 3),
    ...(target.assessmentsJson?.investorFit?.whyItFits || []).slice(0, 2),
  ].filter(Boolean);

  const defaultBody = [
    `[DRAFT — AI-assisted — NOT SENT — SEND-BLOCKED]`,
    `Type: ${params.draftType}`,
    `Investor: ${target.investorName}`,
    `Campaign: Cardbey Seed 2026 (proposed A$3M)`,
    ``,
    `Concise Cardbey description:`,
    CARDBEY_CORE_USP.statement,
    `Mechanism: ${CARDBEY_CORE_USP.mechanism.left} ↔ ${CARDBEY_CORE_USP.mechanism.coordination} ↔ ${CARDBEY_CORE_USP.mechanism.right}`,
    ``,
    `Why this investor may be relevant (evidence-backed assessment — not a probability):`,
    ...whyRelevant.map((line) => `- ${line}`),
    ``,
    `Investor Fit (separate system): ${target.assessmentsJson?.investorFit?.total ?? '—'} / confidence ${target.assessmentsJson?.investorFit?.confidencePct ?? '—'}%`,
    ``,
    `Unresolved gaps: ${(target.unresolvedGapsJson || []).slice(0, 5).join('; ') || 'none listed'}`,
    ``,
    `Attachments (references only — Suitcase INTERNAL; no share):`,
    `- Pitch Deck (registry placeholder — readiness not READY unless contentRef exists)`,
    `- One-page Investment Memo (registry placeholder)`,
    `- Round summary (PROPOSED)`,
    ``,
    `Founder-controlled CTA: [Founder inserts preferred next step — intro call / deck review / decline]`,
    ``,
    `Dossier: target ${target.id}`,
    `Next action: Review draft; approve still does not send.`,
  ].join('\n');

  const draft: DraftRecord = {
    id: newId('draft'),
    targetId: target.id,
    draftType: params.draftType,
    status: 'DRAFT',
    bodyText: params.bodyText || defaultBody,
    markedAsAi: true,
    approvedAt: null,
    approvedBy: null,
    metadataJson: {
      sendBlocked: true,
      mailboxIntegration: 'not_enabled_v1',
      externalContact: false,
      attachmentRefs: ['Pitch Deck', 'One-page Investment Memo', 'Round summary (proposed)'],
      uspRef: CARDBEY_CORE_USP.statement,
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  mem.drafts.set(draft.id, draft);
  void (async () => {
    if (await waitForCampaignPersist(target.campaignId)) {
      await persistDraftRow(draft);
    }
  })();
  appendEvent(target.campaignId, FUNDRAISING_EVENTS.OUTREACH_DRAFT_CREATED, { draftId: draft.id, draftType: draft.draftType }, target.id, params.actorId ?? null);
  return { ok: true as const, draft, sends: false };
}

export function approveOutreachDraft(params: { draftId: string; actorId?: string | null }) {
  const draft = mem.drafts.get(params.draftId);
  if (!draft) return { ok: false as const, error: 'draft_not_found' };
  if (draft.status !== 'DRAFT') return { ok: false as const, error: 'not_draft' };
  draft.status = 'APPROVED';
  draft.approvedAt = nowIso();
  draft.approvedBy = params.actorId ?? null;
  draft.updatedAt = nowIso();
  // Still no send path
  (draft.metadataJson as any).sendBlocked = true;
  void (async () => {
    const t = mem.targets.get(draft.targetId);
    if (t && (await waitForCampaignPersist(t.campaignId))) {
      await persistDraftRow(draft);
    }
  })();
  const target = mem.targets.get(draft.targetId);
  if (target) {
    appendEvent(target.campaignId, FUNDRAISING_EVENTS.OUTREACH_DRAFT_APPROVED, { draftId: draft.id, sendBlocked: true }, target.id, params.actorId ?? null);
  }
  return { ok: true as const, draft, sends: false, message: 'Draft approved for founder control — no email sent' };
}

export function listTargets(campaignKey = FUNDRAISING_CAMPAIGN_KEY_CARDBEY_SEED_2026) {
  const campaign = ensureCardbeySeed2026Campaign();
  return [...mem.targets.values()].filter((t) => t.campaignId === campaign.id);
}

export function listDocuments(campaignKey = FUNDRAISING_CAMPAIGN_KEY_CARDBEY_SEED_2026) {
  const campaign = ensureCardbeySeed2026Campaign();
  return [...mem.docs.values()].filter((d) => d.campaignId === campaign.id);
}

export function listGapsForTarget(targetId: string) {
  return [...mem.gaps.values()].filter((g) => g.targetId === targetId);
}

export function listEvents(campaignKey = FUNDRAISING_CAMPAIGN_KEY_CARDBEY_SEED_2026) {
  const campaign = ensureCardbeySeed2026Campaign();
  return mem.events.filter((e) => e.campaignId === campaign.id);
}

export function getTarget(targetId: string) {
  return mem.targets.get(targetId) || null;
}

export function bumpDocumentVersion(params: { documentId: string; evidenceStatus?: string }) {
  const doc = mem.docs.get(params.documentId);
  if (!doc) return { ok: false as const, error: 'document_not_found' };
  const n = Number(String(doc.version).replace(/\D/g, '') || '1') + 1;
  doc.version = `v${n}`;
  doc.updatedAt = nowIso();
  if (params.evidenceStatus) doc.evidenceStatus = params.evidenceStatus;
  // visibility remains INTERNAL — no external share
  doc.visibility = 'INTERNAL';
  void persistDocumentRow(doc);
  appendEvent(doc.campaignId, FUNDRAISING_EVENTS.DOCUMENT_READINESS_CHANGED, {
    documentId: doc.id,
    readiness: classifySuitcaseArtifact(doc).readiness,
  });
  return { ok: true as const, document: doc, externalShare: false };
}

/** Test helper — wipe memory store */
export function __resetFundraisingCampaignMemory() {
  mem.campaigns.clear();
  mem.targets.clear();
  mem.gaps.clear();
  mem.docs.clear();
  mem.drafts.clear();
  mem.events.length = 0;
  questionBankByCampaign.clear();
  hydratePromise = null;
  campaignPersistWaiters.clear();
}

export function __memoryStats() {
  return {
    campaigns: mem.campaigns.size,
    targets: mem.targets.size,
    gaps: mem.gaps.size,
    docs: mem.docs.size,
    drafts: mem.drafts.size,
    events: mem.events.length,
    prismaReady: prismaReady(),
  };
}
