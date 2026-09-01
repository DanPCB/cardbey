/**
 * Capital Resource Network orchestration — calibrate mission vs cohort.
 * No outreach; no hard-coded match outcomes.
 */
import { evaluateReciprocalMatchPair } from '../evaluateReciprocalMatch.js';
import { projectInvestorToMarketGraphNode } from './projectInvestorToMarketGraphNode.js';
import {
  buildQualifiedCapitalOpportunity,
  isCapitalEligibleReciprocalBand,
  type CapitalSeekerProfile,
} from './qualifyCapitalPair.js';
import {
  buildCardbeySeed2026MarketGraphNode,
  buildCardbeySeed2026SeekerProfile,
  getCardbeySeed2026MissionRecord,
  CARDBEY_SEED_2026_NODE_ID,
} from './cardbeySeed2026Mission.js';
import {
  CAPITAL_INVESTOR_RESEARCH_COHORT,
  CARDBEY_SEED_CALIBRATION_CANDIDATE_IDS,
} from './capitalInvestorResearchCohort.js';
import type { QualifiedCapitalOpportunity, CapitalCampaignHandoffContract } from './capitalTypes.js';
import {
  launchpadPersistentMarketGraph,
  type PersistableNode,
} from './persistentMarketGraphStore.js';

export function buildCapitalCampaignHandoff(params: {
  opportunity: QualifiedCapitalOpportunity;
  fundraisingObjectiveId?: string;
}): CapitalCampaignHandoffContract {
  const q = params.opportunity.capitalQualification;
  return {
    kind: 'ADMIT_TO_FUNDRAISING_CAMPAIGN_V1',
    companyNodeId: params.opportunity.companyNodeId,
    investorNodeId: params.opportunity.investorNodeId,
    fundraisingObjectiveId: params.fundraisingObjectiveId ?? 'cardbey-seed-2026',
    evidenceRefs: [],
    reciprocalBand: params.opportunity.reciprocalBand,
    capitalQualificationBand: q.band,
    unresolvedGaps: [...q.unknowns, ...q.contradictions],
    sourceProvenance: {
      pipeline: 'capital_resource_network_v1',
      preparedWithoutOutreach: true,
    },
    preparedAt: new Date().toISOString(),
    requiresHumanConfirmation: true,
  };
}

export type CapitalCalibrationRow = {
  catalogId: string;
  investorName: string;
  investorType: string;
  reciprocalBand: string;
  capitalBand: string;
  evidenceConfidence: string;
  compatibleFactors: string[];
  contradictions: string[];
  unknowns: string[];
  rankingReasons: string[];
  reviewPriority: number;
  isCalibrationCandidate: boolean;
};

export function calibrateCardbeySeedAgainstCohort(options?: {
  cohortIds?: string[];
  companyProfile?: CapitalSeekerProfile;
}): {
  mission: ReturnType<typeof getCardbeySeed2026MissionRecord>;
  companyNodeId: string;
  rows: CapitalCalibrationRow[];
} {
  const companyNode = buildCardbeySeed2026MarketGraphNode();
  const companyProfile = options?.companyProfile ?? buildCardbeySeed2026SeekerProfile();
  const cohort = options?.cohortIds?.length
    ? CAPITAL_INVESTOR_RESEARCH_COHORT.filter((c) => options.cohortIds!.includes(c.catalogId))
    : CAPITAL_INVESTOR_RESEARCH_COHORT;

  const rows: CapitalCalibrationRow[] = [];
  for (const org of cohort) {
    const { node: investorNode, capitalProfile } = projectInvestorToMarketGraphNode(org);
    const reciprocal = evaluateReciprocalMatchPair(companyNode, investorNode);
    const opportunity = buildQualifiedCapitalOpportunity({
      companyNode,
      investorNode,
      reciprocal,
      companyProfile,
      investorProfile: capitalProfile,
    });
    rows.push({
      catalogId: org.catalogId,
      investorName: org.name,
      investorType: org.type,
      reciprocalBand: reciprocal.reciprocalBand,
      capitalBand: opportunity.capitalQualification.band,
      evidenceConfidence: reciprocal.evidenceConfidence,
      compatibleFactors: opportunity.capitalQualification.compatibleFactors,
      contradictions: opportunity.capitalQualification.contradictions,
      unknowns: opportunity.capitalQualification.unknowns,
      rankingReasons: opportunity.capitalQualification.rankingReasons,
      reviewPriority: opportunity.capitalQualification.reviewPriority,
      isCalibrationCandidate: CARDBEY_SEED_CALIBRATION_CANDIDATE_IDS.includes(org.catalogId),
    });
  }

  rows.sort((a, b) => b.reviewPriority - a.reviewPriority);

  return {
    mission: getCardbeySeed2026MissionRecord(),
    companyNodeId: CARDBEY_SEED_2026_NODE_ID,
    rows,
  };
}

/** Admit Cardbey mission + cohort into graph (memory or prisma). */
export async function admitCapitalMissionAndCohort(options?: { replace?: boolean }) {
  const companyNode = buildCardbeySeed2026MarketGraphNode();
  const companyPersist: PersistableNode = {
    ...companyNode,
    domain: 'CAPITAL',
    resourceType: 'capital_seeker',
    sourceType: 'cardbey_native',
    sourceRef: 'cardbey-seed-2026',
    provenance: { permissionBasis: 'internal_mission' },
  };

  await launchpadPersistentMarketGraph.admit(companyPersist, { replace: options?.replace ?? true });

  const admittedInvestors = [];
  for (const org of CAPITAL_INVESTOR_RESEARCH_COHORT) {
    const { node, capitalProfile } = projectInvestorToMarketGraphNode(org);
    const persist: PersistableNode = {
      ...node,
      domain: 'CAPITAL',
      resourceType:
        org.type === 'ACCELERATOR' || org.type === 'STRATEGIC'
          ? 'strategic_or_program_capital'
          : 'capital_provider',
      sourceType: 'licensed_feed',
      sourceRef: org.catalogId,
      capitalProfile,
      provenance: {
        permissionBasis: 'public_catalog',
        evidenceAsOf: org.evidenceAsOf ?? null,
      },
      evidenceRefs: capitalProfile.evidenceRefs,
    };
    const companyProfile = buildCardbeySeed2026SeekerProfile();
    const reciprocal = evaluateReciprocalMatchPair(companyNode, node);
    const qualMap = new Map();
    if (isCapitalEligibleReciprocalBand(reciprocal.reciprocalBand)) {
      const opp = buildQualifiedCapitalOpportunity({
        companyNode,
        investorNode: node,
        reciprocal,
        companyProfile,
        investorProfile: capitalProfile,
      });
      qualMap.set(CARDBEY_SEED_2026_NODE_ID, opp.capitalQualification);
    }
    const result = await launchpadPersistentMarketGraph.admit(persist, {
      replace: options?.replace ?? true,
      capitalQualificationFor: qualMap,
    });
    admittedInvestors.push({ catalogId: org.catalogId, nodeId: node.nodeId, matches: result.matches.length });
  }

  return {
    companyNodeId: CARDBEY_SEED_2026_NODE_ID,
    admittedInvestors,
    calibration: calibrateCardbeySeedAgainstCohort(),
  };
}
