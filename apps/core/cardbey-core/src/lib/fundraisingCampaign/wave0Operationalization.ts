/**
 * Wave 0 review table + end-to-end rehearsal (no external contact).
 */
import { calibrateCardbeySeedAgainstCohort } from '../marketIntent/capital/capitalResourceNetworkService.js';
import { getCapitalCohortById, CARDBEY_SEED_CALIBRATION_CANDIDATE_IDS } from '../marketIntent/capital/capitalInvestorResearchCohort.js';
import { projectInvestorToMarketGraphNode } from '../marketIntent/capital/projectInvestorToMarketGraphNode.js';
import { launchpadPersistentMarketGraph } from '../marketIntent/capital/persistentMarketGraphStore.js';
import {
  admitCatalogInvestorToCampaign,
  createOutreachDraft,
  ensureCardbeySeed2026Campaign,
  getCampaignOverview,
  listDocuments,
  listGapsForTarget,
  resolveResearchGap,
  transitionTargetLifecycle,
  __resetFundraisingCampaignMemory,
} from './fundraisingCampaignService.js';
import {
  classifySuitcaseArtifact,
  recommendOperatorAction,
  type OperatorAction,
} from './campaignPrepContent.js';
import { FUNDRAISING_EVENTS } from './fundraisingCampaignContracts.js';

export type Wave0ReviewRow = {
  investor: string;
  catalogId: string;
  region: string;
  investorType: string;
  reciprocalBand: string;
  capitalQualification: string;
  investorFitV1: string;
  evidenceConfidence: string;
  stageCompatibility: string;
  chequeCompatibility: string;
  geographyCompatibility: string;
  thesisCompatibility: string;
  leadFollowEvidence: string;
  majorSupportingEvidence: string[];
  contradictions: string[];
  unknowns: string[];
  researchGaps: string[];
  lastEvidenceDate: string | null;
  recommendedOperatorAction: OperatorAction;
};

const WAVE0_FOCUS_IDS = [
  ...CARDBEY_SEED_CALIBRATION_CANDIDATE_IDS,
  'inv_wavemaker_sea',
  'inv_insignia_sea',
  'inv_vertex_sea',
  'inv_500_global',
];

export function buildWave0ReviewTable(limit = 12): Wave0ReviewRow[] {
  const calibration = calibrateCardbeySeedAgainstCohort();
  const preferred = new Set(WAVE0_FOCUS_IDS);
  const ranked = [...calibration.rows].sort((a, b) => {
    const ap = preferred.has(a.catalogId) ? 1 : 0;
    const bp = preferred.has(b.catalogId) ? 1 : 0;
    if (bp !== ap) return bp - ap;
    if (a.investorType === 'VC' && b.investorType !== 'VC') return -1;
    if (b.investorType === 'VC' && a.investorType !== 'VC') return 1;
    return b.reviewPriority - a.reviewPriority;
  });

  return ranked.slice(0, limit).map((row) => {
    const org = getCapitalCohortById(row.catalogId);
    const { capitalProfile } = projectInvestorToMarketGraphNode(org as any);
    const openGaps = capitalProfile.unknownFields.length;
    // Derive dimension labels from ranking reasons / unknowns (no invented probability)
    const stageCompatibility = /stage overlap/i.test(row.rankingReasons.join(' '))
      ? 'COMPATIBLE'
      : row.contradictions.some((c) => /stage/i.test(c))
        ? 'INCOMPATIBLE'
        : 'UNKNOWN';
    const chequeCompatibility = row.unknowns.some((u) => /cheque/i.test(u))
      ? 'UNKNOWN'
      : row.contradictions.some((c) => /cheque|raise/i.test(c))
        ? 'INCOMPATIBLE'
        : 'PARTIAL';
    const geographyCompatibility = /geography overlap|global mandate/i.test(row.rankingReasons.join(' '))
      ? /global mandate/i.test(row.rankingReasons.join(' '))
        ? 'PARTIAL'
        : 'COMPATIBLE'
      : row.contradictions.some((c) => /geography/i.test(c))
        ? 'INCOMPATIBLE'
        : 'UNKNOWN';
    const thesisCompatibility = /theme overlap/i.test(row.rankingReasons.join(' ')) ? 'COMPATIBLE' : 'PARTIAL';

    const action = recommendOperatorAction({
      reciprocalBand: row.reciprocalBand,
      capitalBand: row.capitalBand,
      investorType: row.investorType,
      openGaps: capitalProfile.unknownFields.filter((f) =>
        ['cheque_min', 'cheque_max', 'stage_exclusions'].includes(f),
      ).length,
      contradictions: row.contradictions.length,
    });

    return {
      investor: row.investorName,
      catalogId: row.catalogId,
      region: org?.geography || 'unknown',
      investorType: row.investorType,
      reciprocalBand: row.reciprocalBand,
      capitalQualification: row.capitalBand,
      investorFitV1: 'computed_on_admit',
      evidenceConfidence: row.evidenceConfidence,
      stageCompatibility,
      chequeCompatibility,
      geographyCompatibility,
      thesisCompatibility,
      leadFollowEvidence: org?.canLead ? 'AI_INTERPRETATION:canLead=true' : 'AI_INTERPRETATION:canLead=false',
      majorSupportingEvidence: capitalProfile.sourceFacts.map((f) => f.summary).slice(0, 3),
      contradictions: row.contradictions,
      unknowns: row.unknowns,
      researchGaps: capitalProfile.unknownFields,
      lastEvidenceDate: org?.evidenceAsOf ?? null,
      recommendedOperatorAction: action,
    };
  });
}

/**
 * One complete internal rehearsal — AirTree by default.
 * No external contact. Does not auto-admit Wave0 cohort.
 */
export async function runWave0InternalRehearsal(options?: {
  catalogId?: string;
  resetMemory?: boolean;
  resolveChequeWithPublicFact?: boolean;
}) {
  if (options?.resetMemory !== false) {
    __resetFundraisingCampaignMemory();
  }

  const catalogId = options?.catalogId || 'inv_airtree_au';
  const campaign = ensureCardbeySeed2026Campaign();
  const overviewBefore = getCampaignOverview();

  // Graph nodes
  const { buildCardbeySeed2026MarketGraphNode } = await import(
    '../marketIntent/capital/cardbeySeed2026Mission.js'
  );
  const companyNode = buildCardbeySeed2026MarketGraphNode();
  await launchpadPersistentMarketGraph.admit(
    { ...companyNode, domain: 'CAPITAL', resourceType: 'capital_seeker' },
    { replace: true },
  );
  const org = getCapitalCohortById(catalogId)!;
  const projected = projectInvestorToMarketGraphNode(org);
  await launchpadPersistentMarketGraph.admit(
    {
      ...projected.node,
      domain: 'CAPITAL',
      resourceType: 'capital_provider',
      capitalProfile: projected.capitalProfile,
    },
    { replace: true },
  );

  const admit = admitCatalogInvestorToCampaign({
    catalogId,
    confirmed: true,
    admittingOperatorId: 'wave0_rehearsal',
  });
  if (!admit.ok) {
    return { ok: false as const, step: 'admit', error: admit };
  }

  const gapsBefore = listGapsForTarget(admit.target.id);
  let reeval: any = null;
  if (options?.resolveChequeWithPublicFact !== false) {
    const chequeGap = gapsBefore.find((g) => g.field === 'chequeRange');
    if (chequeGap) {
      // Public-style SOURCE_FACT with explicit provenance — illustrative range for rehearsal only when marked
      reeval = await resolveResearchGapAndReevaluate({
        gapId: chequeGap.id,
        resolution: {
          evidenceKind: 'SOURCE_FACT',
          summary:
            'Public early-stage AU VC cheque sizes commonly reported in public media as mid-six to low-seven figures AUD; exact AirTree cheque band remains partially UNKNOWN without primary fund disclosure.',
          sourceUrl: 'https://www.airtree.vc/',
          fieldUpdates: {
            // Do not invent a precise cheque — leave numeric null to keep honesty unless primary disclosure exists
            chequeMinAud: null,
            chequeMaxAud: null,
            keepUnknownCheque: true,
          },
        },
        actorId: 'wave0_rehearsal',
      });
    }
  }

  transitionTargetLifecycle({
    targetId: admit.target.id,
    to: 'RESEARCHED',
    actorId: 'wave0_rehearsal',
    reason: 'rehearsal_research_complete',
  });

  const draft = createOutreachDraft({
    targetId: admit.target.id,
    draftType: 'initial_investor_email',
    actorId: 'wave0_rehearsal',
  });

  const suitcase = listDocuments().map((d) => ({
    title: d.title,
    category: d.category,
    registryStatus: d.status,
    ...classifySuitcaseArtifact(d),
  }));

  const overview = getCampaignOverview();

  return {
    ok: true as const,
    campaignId: campaign.id,
    campaignState: overview.campaign.state,
    targetId: admit.target.id,
    assessments: admit.assessments,
    gapsBefore: gapsBefore.map((g) => g.field),
    reeval,
    draft: draft.ok
      ? { id: draft.draft.id, status: draft.draft.status, sendBlocked: true }
      : null,
    suitcase,
    suitcaseReadyCount: suitcase.filter((s) => s.readiness === 'READY').length,
    nextActions: overview.nextActions,
    eventsEmitted: [FUNDRAISING_EVENTS.INVESTOR_ADMITTED, FUNDRAISING_EVENTS.OUTREACH_DRAFT_CREATED],
    sends: false,
    externalContact: false,
    overviewBeforeState: overviewBefore.campaign.state,
  };
}

/** Resolve gap + reproject + stale match + capital/reciprocal re-eval on target. */
export async function resolveResearchGapAndReevaluate(params: {
  gapId: string;
  resolution: {
    evidenceKind: 'SOURCE_FACT' | 'AI_INTERPRETATION';
    summary: string;
    sourceUrl?: string | null;
    fieldUpdates?: {
      chequeMinAud?: number | null;
      chequeMaxAud?: number | null;
      keepUnknownCheque?: boolean;
      stages?: string[];
    };
  };
  actorId?: string | null;
}) {
  const resolved = resolveResearchGap({
    gapId: params.gapId,
    resolution: params.resolution,
    actorId: params.actorId,
  });
  if (!resolved.ok) return resolved;

  // Import service internals via public re-eval helper
  const { reevaluateTargetAfterEvidence } = await import('./fundraisingCampaignService.js');
  const reeval = await reevaluateTargetAfterEvidence({
    targetId: resolved.gap.targetId,
    field: resolved.gap.field,
    fieldUpdates: params.resolution.fieldUpdates,
    sourceFact: {
      summary: params.resolution.summary,
      sourceUrl: params.resolution.sourceUrl ?? null,
    },
    actorId: params.actorId,
  });

  return {
    ok: true as const,
    gap: resolved.gap,
    reevaluation: reeval,
    sends: false,
  };
}
