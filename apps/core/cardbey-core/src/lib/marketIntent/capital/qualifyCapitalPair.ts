/**
 * Capital / investor domain qualification — runs AFTER general reciprocal match.
 *
 * Factor ownership (no double-count):
 * - Reciprocal matcher: HAS/WANTS overlap, coarse geography strings, generic constraints,
 *   competing-supply / actor-type guards, evidence confidence on node pair.
 * - This module: stage, cheque range, mandate themes, lead/follow, capital geo codes.
 *
 * No predictive funding probability.
 */
import type { MarketGraphNode } from '../marketGraphNode.js';
import type { MarketMatch, ReciprocalBand } from '../marketMatchTypes.js';
import type {
  CapitalDomainQualification,
  CapitalDimensionFit,
  CapitalQualificationBand,
  CapitalResourceProfile,
  QualifiedCapitalOpportunity,
} from './capitalTypes.js';

export type CapitalSeekerProfile = {
  stagesSought: string[];
  raiseAmountAud: number | null;
  geographies: string[];
  themes: string[];
  seeksLead: boolean | null;
};

function dim(ok: boolean | null): CapitalDimensionFit {
  if (ok === true) return 'COMPATIBLE';
  if (ok === false) return 'INCOMPATIBLE';
  return 'UNKNOWN';
}

function overlap(a: string[], b: string[]): string[] {
  const setB = new Set(b.map((x) => x.toLowerCase()));
  return a.filter((x) => setB.has(x.toLowerCase()));
}

export function qualifyCapitalPair(params: {
  companyNode: MarketGraphNode;
  investorNode: MarketGraphNode;
  reciprocal: MarketMatch;
  companyProfile: CapitalSeekerProfile;
  investorProfile: CapitalResourceProfile;
}): CapitalDomainQualification {
  const { reciprocal, companyProfile, investorProfile } = params;
  const compatible: string[] = [];
  const contradictions: string[] = [];
  const unknowns: string[] = [...investorProfile.unknownFields.map((f) => `investor_${f}`)];
  const rankingReasons: string[] = [];

  // Stage
  const stageHits = overlap(companyProfile.stagesSought, investorProfile.stages);
  let stageFit: CapitalDimensionFit = 'UNKNOWN';
  if (!companyProfile.stagesSought.length || !investorProfile.stages.length) {
    stageFit = 'UNKNOWN';
    unknowns.push('stage_comparison');
  } else if (stageHits.length) {
    stageFit = 'COMPATIBLE';
    compatible.push(`stage: ${stageHits.join(', ')}`);
    rankingReasons.push(`Stage overlap: ${stageHits.join(', ')}`);
  } else {
    stageFit = 'INCOMPATIBLE';
    contradictions.push(
      `Stage mismatch: company seeks ${companyProfile.stagesSought.join(', ')}; investor stages ${investorProfile.stages.join(', ')}`,
    );
  }

  // Cheque / raise size
  let chequeFit: CapitalDimensionFit = 'UNKNOWN';
  const raise = companyProfile.raiseAmountAud;
  const minC = investorProfile.chequeMinAud;
  const maxC = investorProfile.chequeMaxAud;
  if (raise == null || (minC == null && maxC == null)) {
    chequeFit = 'UNKNOWN';
    unknowns.push('cheque_comparison');
  } else if (maxC != null && raise > maxC * 3) {
    // Round much larger than typical cheque → often syndicate; mark PARTIAL not hard fail
    chequeFit = 'PARTIAL';
    rankingReasons.push(`Raise A$${raise} exceeds typical max cheque A$${maxC} — may need syndicate`);
  } else if (minC != null && raise < minC) {
    chequeFit = 'INCOMPATIBLE';
    contradictions.push(`Raise A$${raise} below investor min cheque A$${minC}`);
  } else if (maxC != null && raise > maxC) {
    chequeFit = 'PARTIAL';
    rankingReasons.push(`Raise A$${raise} above single-cheque max A$${maxC}`);
  } else {
    chequeFit = 'COMPATIBLE';
    compatible.push('cheque/raise within evidenced range or unconstrained');
    rankingReasons.push('Cheque/raise appears compatible with evidenced range');
  }

  // Geography (capital codes)
  const geoHits = overlap(companyProfile.geographies, investorProfile.geographies);
  let geographyFit: CapitalDimensionFit = 'UNKNOWN';
  if (!companyProfile.geographies.length || !investorProfile.geographies.length) {
    geographyFit = 'UNKNOWN';
    unknowns.push('geography_codes');
  } else if (geoHits.length) {
    geographyFit = 'COMPATIBLE';
    compatible.push(`geography: ${geoHits.join(', ')}`);
    rankingReasons.push(`Geography overlap: ${geoHits.join(', ')}`);
  } else if (
    investorProfile.geographies.includes('global') ||
    companyProfile.geographies.includes('global')
  ) {
    geographyFit = 'PARTIAL';
    rankingReasons.push('Global mandate — geography partially open');
  } else {
    geographyFit = 'INCOMPATIBLE';
    contradictions.push(
      `Geography mismatch: company ${companyProfile.geographies.join(', ')} vs investor ${investorProfile.geographies.join(', ')}`,
    );
  }

  // Mandate themes
  const themeHits = overlap(companyProfile.themes, investorProfile.themes);
  let mandateFit: CapitalDimensionFit = 'UNKNOWN';
  if (!companyProfile.themes.length || !investorProfile.themes.length) {
    mandateFit = 'UNKNOWN';
    unknowns.push('mandate_themes');
  } else if (themeHits.length) {
    mandateFit = 'COMPATIBLE';
    compatible.push(`themes: ${themeHits.join(', ')}`);
    rankingReasons.push(`Theme overlap: ${themeHits.join(', ')}`);
  } else {
    mandateFit = 'PARTIAL';
    rankingReasons.push('No explicit theme overlap — review mandate manually');
  }

  // Lead/follow
  let leadFollowFit: CapitalDimensionFit = 'UNKNOWN';
  if (companyProfile.seeksLead == null || investorProfile.canLead == null) {
    leadFollowFit = 'UNKNOWN';
    unknowns.push('lead_follow');
  } else if (companyProfile.seeksLead && investorProfile.canLead) {
    leadFollowFit = 'COMPATIBLE';
    compatible.push('lead capability');
  } else if (companyProfile.seeksLead && !investorProfile.canLead) {
    leadFollowFit = 'PARTIAL';
    rankingReasons.push('Company may want a lead; investor catalog marks follow/program');
  } else {
    leadFollowFit = 'COMPATIBLE';
  }

  // Band synthesis — never invent conversion probability
  let band: CapitalQualificationBand = 'REVIEW_REQUIRED';
  if (contradictions.some((c) => /Stage mismatch|below investor min/i.test(c))) {
    band = 'INCOMPATIBLE';
  } else if (
    reciprocal.reciprocalBand === 'CONTRADICTED' ||
    reciprocal.reciprocalBand === 'INSUFFICIENT_EVIDENCE'
  ) {
    band =
      reciprocal.reciprocalBand === 'CONTRADICTED' ? 'INCOMPATIBLE' : 'INSUFFICIENT_EVIDENCE';
  } else if (
    stageFit === 'COMPATIBLE' &&
    geographyFit === 'COMPATIBLE' &&
    (chequeFit === 'COMPATIBLE' || chequeFit === 'PARTIAL' || chequeFit === 'UNKNOWN') &&
    mandateFit !== 'INCOMPATIBLE'
  ) {
    band = themeHits.length >= 1 && chequeFit !== 'UNKNOWN' ? 'QUALIFIED' : 'PARTIAL';
  } else if (stageFit === 'INCOMPATIBLE' || geographyFit === 'INCOMPATIBLE') {
    band = 'INCOMPATIBLE';
  } else {
    band = 'REVIEW_REQUIRED';
  }

  // Ordinal review priority (higher = review sooner) — NOT a funding probability
  let reviewPriority = 40;
  if (band === 'QUALIFIED') reviewPriority += 30;
  if (band === 'PARTIAL') reviewPriority += 15;
  if (stageFit === 'COMPATIBLE') reviewPriority += 8;
  if (geographyFit === 'COMPATIBLE') reviewPriority += 8;
  if (themeHits.length) reviewPriority += Math.min(12, themeHits.length * 4);
  if (reciprocal.reciprocalBand === 'STRONG_RECIPROCAL') reviewPriority += 10;
  if (reciprocal.reciprocalBand === 'ONE_WAY_STRONG') reviewPriority += 6;
  if (band === 'INCOMPATIBLE') reviewPriority = Math.min(reviewPriority, 25);
  reviewPriority = Math.max(0, Math.min(100, reviewPriority));

  rankingReasons.push(`Reciprocal band: ${reciprocal.reciprocalBand}`);
  rankingReasons.push(`Capital qualification: ${band}`);

  return {
    kind: 'CAPITAL_DOMAIN_QUALIFICATION_V1',
    band,
    stageFit,
    chequeFit,
    geographyFit,
    mandateFit,
    leadFollowFit,
    compatibleFactors: compatible,
    contradictions,
    unknowns: [...new Set(unknowns)],
    rankingReasons,
    reviewPriority,
  };
}

export function buildQualifiedCapitalOpportunity(params: {
  companyNode: MarketGraphNode;
  investorNode: MarketGraphNode;
  reciprocal: MarketMatch;
  companyProfile: CapitalSeekerProfile;
  investorProfile: CapitalResourceProfile;
}): QualifiedCapitalOpportunity {
  const capitalQualification = qualifyCapitalPair(params);
  return {
    kind: 'QUALIFIED_CAPITAL_OPPORTUNITY_V1',
    companyNodeId: params.companyNode.nodeId,
    investorNodeId: params.investorNode.nodeId,
    reciprocalBand: params.reciprocal.reciprocalBand,
    reciprocalMatch: params.reciprocal,
    capitalQualification,
    reviewState: 'pending',
    handoff: null,
  };
}

export function isCapitalEligibleReciprocalBand(band: ReciprocalBand): boolean {
  return band === 'STRONG_RECIPROCAL' || band === 'ONE_WAY_STRONG' || band === 'POSSIBLE';
}
