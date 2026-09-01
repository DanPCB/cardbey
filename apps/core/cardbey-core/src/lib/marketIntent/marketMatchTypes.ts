/**
 * Reciprocal match types — explainable bands, no fake probabilities.
 */
import type { NeedCapabilityOverlap, OverlapStrength } from './wantHasCompatibility.js';
import type { MarketActorRole, MarketSide } from './types.js';

export type ReciprocalBand =
  | 'STRONG_RECIPROCAL'
  | 'ONE_WAY_STRONG'
  | 'POSSIBLE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'CONTRADICTED';

export type FitAssessment = 'COMPATIBLE' | 'PARTIAL' | 'UNKNOWN' | 'INCOMPATIBLE';

export type GraphNodeRef = {
  nodeId: string;
  label: string;
  actorRole: MarketActorRole;
  marketSide: MarketSide;
};

export type MarketMatch = {
  nodeA: GraphNodeRef;
  nodeB: GraphNodeRef;
  reciprocalBand: ReciprocalBand;
  aNeedsFromB: NeedCapabilityOverlap[];
  bNeedsFromA: NeedCapabilityOverlap[];
  geographicFit: FitAssessment;
  constraintFit: FitAssessment;
  timingFit: FitAssessment;
  evidenceConfidence: 'STRONG' | 'MODERATE' | 'WEAK';
  matchReasons: string[];
  conflicts: string[];
  unknowns: string[];
  matcherVersion: string;
};

export type ReciprocalMatchInput = {
  nodeA: import('./marketGraphNode.js').MarketGraphNode;
  nodeB: import('./marketGraphNode.js').MarketGraphNode;
};

export const MATCHER_VERSION = 'market-match-reciprocal-v1.0.0';

export const DEFAULT_MATCH_UNKNOWNS = [
  'Commercial terms',
  'Capacity',
  'Exclusivity',
] as const;

export function strengthToScore(s: OverlapStrength | null): number {
  if (!s) return 0;
  return s === 'STRONG' ? 3 : s === 'MODERATE' ? 2 : 1;
}
