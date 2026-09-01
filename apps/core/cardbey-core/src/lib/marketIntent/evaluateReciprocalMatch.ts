/**
 * Reciprocal match evaluator — A.WANTS ∩ B.HAS + B.WANTS ∩ A.HAS primitive.
 */
import type { MarketGraphNode } from './marketGraphNode.js';
import {
  computeDirectedOverlaps,
  bestDirectedStrength,
  directedOverlapScore,
  type NeedCapabilityOverlap,
} from './wantHasCompatibility.js';
import {
  DEFAULT_MATCH_UNKNOWNS,
  MATCHER_VERSION,
  strengthToScore,
  type FitAssessment,
  type MarketMatch,
  type ReciprocalBand,
  type ReciprocalMatchInput,
} from './marketMatchTypes.js';

const AU_PATTERNS = /\b(australia|australian|sydney|melbourne|brisbane|perth|adelaide)\b/i;
const VN_PATTERNS = /\b(vietnam|vietnamese|hanoi|ho chi minh|hcm|da nang|đà nẵng|gò vấp|go vap)\b/i;
const LOCAL_PATTERNS = /\b(melbourne|sydney|da nang|đà nẵng|gò vấp|go vap|hcm|hanoi)\b/i;

function nodeRef(node: MarketGraphNode) {
  return {
    nodeId: node.nodeId,
    label: node.label,
    actorRole: node.actorRole,
    marketSide: node.marketSide,
  };
}

function assessGeographicFit(a: MarketGraphNode, b: MarketGraphNode): { fit: FitAssessment; conflicts: string[] } {
  const conflicts: string[] = [];
  const aGeo = a.geographyLabels.join(' ').toLowerCase();
  const bGeo = b.geographyLabels.join(' ').toLowerCase();

  const aAu = AU_PATTERNS.test(aGeo);
  const bAu = AU_PATTERNS.test(bGeo);
  const aVn = VN_PATTERNS.test(aGeo);
  const bVn = VN_PATTERNS.test(bGeo);
  const aLocal = LOCAL_PATTERNS.test(aGeo);
  const bLocal = LOCAL_PATTERNS.test(bGeo);

  if (aLocal && bLocal && aGeo !== bGeo) {
    const aMel = /melbourne/i.test(aGeo);
    const bMel = /melbourne/i.test(bGeo);
    if ((aMel && /sydney/i.test(bGeo)) || (/sydney/i.test(aGeo) && bMel)) {
      conflicts.push('Local geography mismatch (different cities)');
      return { fit: 'INCOMPATIBLE', conflicts };
    }
  }

  if ((aAu && bVn) || (aVn && bAu)) {
  const aWantsAu = a.wants.some((w) => AU_PATTERNS.test(w.label));
  const bWantsAu = b.wants.some((w) => AU_PATTERNS.test(w.label));
  const aWantsVn = a.wants.some((w) => VN_PATTERNS.test(w.label));
  const bWantsVn = b.wants.some((w) => VN_PATTERNS.test(w.label));
    if ((aAu && bVn && bWantsAu) || (aVn && bAu && aWantsAu) || (aVn && bAu && bWantsVn) || (aAu && bVn && aWantsVn)) {
      return { fit: 'COMPATIBLE', conflicts };
    }
    if (aLocal && bLocal && !aAu && !bAu && !aVn && !bVn) {
      return { fit: 'COMPATIBLE', conflicts };
    }
    return { fit: 'PARTIAL', conflicts };
  }

  if (!a.geographyLabels.length || !b.geographyLabels.length) {
    return { fit: 'UNKNOWN', conflicts };
  }

  const shared = a.geographyLabels.some((g) =>
    b.geographyLabels.some((h) => g.toLowerCase() === h.toLowerCase() || g.toLowerCase().includes(h.toLowerCase())),
  );
  if (shared) return { fit: 'COMPATIBLE', conflicts };

  return { fit: 'PARTIAL', conflicts };
}

function assessConstraintFit(a: MarketGraphNode, b: MarketGraphNode): FitAssessment {
  const aConstraints = a.constraints.join(' ').toLowerCase();
  const bConstraints = b.constraints.join(' ').toLowerCase();
  if (!a.constraints.length && !b.constraints.length) return 'UNKNOWN';
  if (/c2c|consumer|personal sale/i.test(aConstraints) && /b2b|commercial|wholesale/i.test(bConstraints)) {
    return 'INCOMPATIBLE';
  }
  if (/b2b|commercial/i.test(aConstraints) && /c2c|consumer|personal/i.test(bConstraints)) {
    return 'INCOMPATIBLE';
  }
  return 'COMPATIBLE';
}

function hasTimingHint(node: MarketGraphNode): boolean {
  return node.constraints.some((c) => /urgent|asap|this week|cuối tuần|deadline/i.test(c));
}

function assessTimingFit(a: MarketGraphNode, b: MarketGraphNode): FitAssessment {
  const aTiming = hasTimingHint(a);
  const bTiming = hasTimingHint(b);
  if (!aTiming && !bTiming) return 'UNKNOWN';
  if (aTiming || bTiming) return 'PARTIAL';
  return 'UNKNOWN';
}

function isCompetingSupply(a: MarketGraphNode, b: MarketGraphNode): boolean {
  if (a.marketSide !== 'SUPPLY' || b.marketSide !== 'SUPPLY') return false;
  const aWantsDist = a.wants.some((w) => w.type === 'DISTRIBUTOR' || w.type === 'RESELLER');
  const bWantsDist = b.wants.some((w) => w.type === 'DISTRIBUTOR' || w.type === 'RESELLER');
  const sameIntent = a.primaryIntent === b.primaryIntent && a.primaryIntent === 'DISTRIBUTE';
  return aWantsDist && bWantsDist && sameIntent;
}

function isConsumerNonCommercial(node: MarketGraphNode): boolean {
  return node.classification === 'NON_COMMERCIAL' || node.actorRole === 'CONSUMER';
}

function isConsumerVsB2bExpansion(a: MarketGraphNode, b: MarketGraphNode): boolean {
  const nodes = [a, b];
  const consumer = nodes.find((n) => n.actorRole === 'CONSUMER');
  const expansion = nodes.find(
    (n) =>
      n !== consumer &&
      (n.primaryIntent === 'PARTNER' ||
        n.primaryIntent === 'INVEST' ||
        n.wants.some((w) => w.type === 'CAPITAL' || w.type === 'PARTNER')),
  );
  return !!consumer && !!expansion;
}

function strongOverlapsShareDomain(
  aNeedsFromB: NeedCapabilityOverlap[],
  bNeedsFromA: NeedCapabilityOverlap[],
): boolean {
  const strongPairs = [
    ...aNeedsFromB.filter((o) => o.strength === 'STRONG'),
    ...bNeedsFromA.filter((o) => o.strength === 'STRONG'),
  ];
  if (!strongPairs.length) return false;

  const capitalFlow = strongPairs.some((o) => /capital flow/i.test(o.reason));
  const moderateCapital = [...aNeedsFromB, ...bNeedsFromA].some((o) => /capital flow/i.test(o.reason));
  if (capitalFlow || moderateCapital) return true;

  const domainGroups = [
    ['paint', 'coating', 'sơn'],
    ['packaging', 'container', 'bao bì'],
    ['security door', 'door'],
    ['food', 'sauce', 'noodle', 'beef'],
    ['coffee'],
    ['pet', 'grooming', 'mèo'],
    ['skincare', 'beauty'],
  ];

  const labels = strongPairs.flatMap((o) => [o.wantLabel, o.hasLabel].map((l) => l.toLowerCase()));
  return domainGroups.some((group) => labels.some((l) => group.some((k) => l.includes(k))));
}

function isC2cVsB2bMismatch(a: MarketGraphNode, b: MarketGraphNode): boolean {
  const isC2c = (node: MarketGraphNode) =>
    node.primaryIntent === 'SELL' &&
    node.has.some((h) => h.type === 'ASSET') &&
    node.wants.some((w) => w.type === 'BUYER');
  const isB2bProcurement = (node: MarketGraphNode) =>
    node.primaryIntent === 'BUY' &&
    node.has.some((h) => h.type === 'BUSINESS') &&
    node.wants.some((w) => w.type === 'SUPPLIER');
  return (isC2c(a) && isB2bProcurement(b)) || (isC2c(b) && isB2bProcurement(a));
}

function buildMatchReasons(
  aNeedsFromB: NeedCapabilityOverlap[],
  bNeedsFromA: NeedCapabilityOverlap[],
  geoFit: FitAssessment,
): string[] {
  const reasons: string[] = [];
  for (const o of aNeedsFromB.filter((x) => x.strength !== 'WEAK').slice(0, 2)) {
    reasons.push(`A wants ${o.wantLabel} — B has ${o.hasLabel} (${o.strength.toLowerCase()})`);
  }
  for (const o of bNeedsFromA.filter((x) => x.strength !== 'WEAK').slice(0, 2)) {
    reasons.push(`B wants ${o.wantLabel} — A has ${o.hasLabel} (${o.strength.toLowerCase()})`);
  }
  if (geoFit === 'COMPATIBLE') reasons.push('Geographic fit is compatible');
  else if (geoFit === 'PARTIAL') reasons.push('Geographic fit is partial — cross-border or broad scope');
  return reasons;
}

function assignBand(params: {
  aNeedsFromB: NeedCapabilityOverlap[];
  bNeedsFromA: NeedCapabilityOverlap[];
  geoFit: FitAssessment;
  constraintFit: FitAssessment;
  a: MarketGraphNode;
  b: MarketGraphNode;
  conflicts: string[];
}): ReciprocalBand {
  const { aNeedsFromB, bNeedsFromA, geoFit, constraintFit, a, b, conflicts } = params;

  if (constraintFit === 'INCOMPATIBLE') return 'CONTRADICTED';
  if (isCompetingSupply(a, b)) return 'CONTRADICTED';
  if (isC2cVsB2bMismatch(a, b)) return 'CONTRADICTED';
  if (isConsumerVsB2bExpansion(a, b)) return 'INSUFFICIENT_EVIDENCE';
  if (geoFit === 'INCOMPATIBLE') return 'CONTRADICTED';

  const aStrength = bestDirectedStrength(aNeedsFromB);
  const bStrength = bestDirectedStrength(bNeedsFromA);
  const aScore = directedOverlapScore(aNeedsFromB);
  const bScore = directedOverlapScore(bNeedsFromA);

  const consumerMismatch =
    (isConsumerNonCommercial(a) && b.marketSide === 'SUPPLY' && !aNeedsFromB.some((o) => o.strength !== 'WEAK')) ||
    (isConsumerNonCommercial(b) && a.marketSide === 'SUPPLY' && !bNeedsFromA.some((o) => o.strength !== 'WEAK'));

  if (consumerMismatch && aScore === 0 && bScore === 0) return 'INSUFFICIENT_EVIDENCE';
  if (consumerMismatch && strengthToScore(aStrength) <= 1 && strengthToScore(bStrength) <= 1) {
    return 'INSUFFICIENT_EVIDENCE';
  }

  const aStrong = strengthToScore(aStrength) >= 3;
  const bStrong = strengthToScore(bStrength) >= 3;
  const aModerate = strengthToScore(aStrength) >= 2;
  const bModerate = strengthToScore(bStrength) >= 2;
  const domainAligned = strongOverlapsShareDomain(aNeedsFromB, bNeedsFromA);

  if (aStrong && bStrong && geoFit !== 'INCOMPATIBLE' && domainAligned) {
    return 'STRONG_RECIPROCAL';
  }

  if (((aStrong && bModerate) || (bStrong && aModerate)) && domainAligned) {
    return 'STRONG_RECIPROCAL';
  }

  if ((aStrong && !bModerate) || (bStrong && !aModerate)) {
    return 'ONE_WAY_STRONG';
  }

  if (aModerate && bModerate) {
    return 'POSSIBLE';
  }

  if (aStrong || bStrong) {
    return geoFit === 'INCOMPATIBLE' ? 'CONTRADICTED' : 'ONE_WAY_STRONG';
  }

  if (aScore > 0 || bScore > 0) {
    return conflicts.length ? 'POSSIBLE' : 'POSSIBLE';
  }

  return 'INSUFFICIENT_EVIDENCE';
}

export function evaluateReciprocalMatch(input: ReciprocalMatchInput): MarketMatch {
  const { nodeA, nodeB } = input;

  const aNeedsFromB = computeDirectedOverlaps(nodeA.has, nodeA.wants, nodeB.has);
  const bNeedsFromA = computeDirectedOverlaps(nodeB.has, nodeB.wants, nodeA.has);

  const geo = assessGeographicFit(nodeA, nodeB);
  const constraintFit = assessConstraintFit(nodeA, nodeB);
  const timingFit = assessTimingFit(nodeA, nodeB);

  const conflicts = [...geo.conflicts];
  if (constraintFit === 'INCOMPATIBLE') {
    conflicts.push('Constraint mismatch (e.g. C2C vs B2B)');
  }
  if (isCompetingSupply(nodeA, nodeB)) {
    conflicts.push('Both nodes are supply-side seeking the same channel type — competing, not reciprocal');
  }
  if (isC2cVsB2bMismatch(nodeA, nodeB)) {
    conflicts.push('C2C consumer sale vs B2B procurement — incompatible market segment');
  }

  const reciprocalBand = assignBand({
    aNeedsFromB,
    bNeedsFromA,
    geoFit: geo.fit,
    constraintFit,
    a: nodeA,
    b: nodeB,
    conflicts,
  });

  const evidenceConfidence: MarketMatch['evidenceConfidence'] =
    nodeA.evidenceConfidence === 'WEAK' || nodeB.evidenceConfidence === 'WEAK'
      ? 'WEAK'
      : nodeA.evidenceConfidence === 'STRONG' && nodeB.evidenceConfidence === 'STRONG'
        ? 'STRONG'
        : 'MODERATE';

  const unknowns = [...DEFAULT_MATCH_UNKNOWNS];
  if (geo.fit === 'UNKNOWN') unknowns.push('Geographic scope not fully specified');
  if (timingFit === 'UNKNOWN') unknowns.push('Timing alignment');

  return {
    nodeA: nodeRef(nodeA),
    nodeB: nodeRef(nodeB),
    reciprocalBand,
    aNeedsFromB,
    bNeedsFromA,
    geographicFit: geo.fit,
    constraintFit,
    timingFit,
    evidenceConfidence,
    matchReasons: buildMatchReasons(aNeedsFromB, bNeedsFromA, geo.fit),
    conflicts,
    unknowns,
    matcherVersion: MATCHER_VERSION,
  };
}

export function evaluateReciprocalMatchPair(
  nodeA: MarketGraphNode,
  nodeB: MarketGraphNode,
): MarketMatch {
  return evaluateReciprocalMatch({ nodeA, nodeB });
}
