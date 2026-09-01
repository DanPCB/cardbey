/**
 * Live Match Review Pilot V1 — operator market-truth layer.
 * Does NOT mutate structural match bands or evaluateReciprocalMatch output.
 */

export const MATCH_REVIEW_DECISIONS = Object.freeze([
  'PURSUE',
  'WATCH',
  'REJECT',
  'INSUFFICIENT_EVIDENCE',
] as const);

export type MatchReviewDecision = (typeof MATCH_REVIEW_DECISIONS)[number];

export const MATCH_REVIEW_REASONS = Object.freeze([
  'GOOD_RECIPROCAL_FIT',
  'WRONG_NEED',
  'WRONG_GEOGRAPHY',
  'WRONG_SCALE',
  'STALE_DEMAND',
  'COMMERCIAL_TERMS_UNKNOWN',
  'WEAK_COUNTERPARTY_EVIDENCE',
  'DUPLICATE',
  'NOT_ACTIONABLE',
  'OTHER',
] as const);

export type MatchReviewReason = (typeof MATCH_REVIEW_REASONS)[number];

/** Operator review events + governed connection funnel (missing stages stay UNKNOWN). */
export const MATCH_CONNECTION_EVENT_TYPES = Object.freeze([
  'MATCH_REVIEWED',
  'MATCH_PURSUED',
  'CONNECTION_PREPARED',
  'CONNECTION_APPROVED',
  'CONNECTION_PRESENTED',
  'CONNECTION_SENT',
  'RESPONSE_RECEIVED',
  'CONVERSATION_STARTED',
  'QUALIFIED',
  'CONNECTED',
  'OUTCOME_RECORDED',
] as const);

export type MatchConnectionEventType = (typeof MATCH_CONNECTION_EVENT_TYPES)[number];

export const MATCH_REVIEW_POINTER_STATES = Object.freeze({
  PENDING: 'pending',
  PURSUE: 'pursue',
  WATCH: 'watch',
  REJECT: 'reject',
  INSUFFICIENT_EVIDENCE: 'insufficient_evidence',
} as const);

export type SemanticTruthSnapshot = {
  layer: 'G1_G2';
  nodeA: {
    nodeId: string;
    label: string;
    actorRole: string;
    marketSide: string;
    evidenceConfidence: string;
    hasSummary: Array<{ type: string; label: string; basis?: string }>;
    wantsSummary: Array<{ type: string; label: string; basis?: string }>;
    geography: string[];
    sourceRef?: string | null;
    sourceType?: string | null;
  };
  nodeB: {
    nodeId: string;
    label: string;
    actorRole: string;
    marketSide: string;
    evidenceConfidence: string;
    hasSummary: Array<{ type: string; label: string; basis?: string }>;
    wantsSummary: Array<{ type: string; label: string; basis?: string }>;
    geography: string[];
    sourceRef?: string | null;
    sourceType?: string | null;
  };
};

export type StructuralTruthSnapshot = {
  layer: 'MarketMatch_V1';
  immutable: true;
  pairKey: string;
  reciprocalBand: string;
  matcherVersion: string;
  aNeedsFromB: unknown[];
  bNeedsFromA: unknown[];
  geographicFit: string;
  constraintFit: string;
  timingFit: string;
  evidenceConfidence: string;
  matchReasons: string[];
  conflicts: string[];
  unknowns: string[];
  computedAt: string;
  isStale: boolean;
};

export type MarketTruthSnapshot = {
  layer: 'operator_review';
  decision: MatchReviewDecision;
  reason: MatchReviewReason | null;
  note: string | null;
  reviewedBy: string | null;
  reviewedAt: string;
};

export type MatchReviewRecord = {
  id: string;
  pairKey: string;
  nodeAId: string;
  nodeBId: string;
  decision: MatchReviewDecision;
  reason: MatchReviewReason | null;
  note: string | null;
  reviewerId: string | null;
  semanticTruth: SemanticTruthSnapshot;
  structuralTruth: StructuralTruthSnapshot;
  marketTruth: MarketTruthSnapshot;
  createdAt: string;
};

export type MatchConnectionEventRecord = {
  id: string;
  pairKey: string;
  reviewId: string | null;
  eventType: MatchConnectionEventType;
  stageState: 'RECORDED' | 'UNKNOWN';
  actorId: string | null;
  payloadJson: unknown;
  occurredAt: string;
  externalContact: false;
};

export function decisionToPointerState(decision: MatchReviewDecision): string {
  switch (decision) {
    case 'PURSUE':
      return MATCH_REVIEW_POINTER_STATES.PURSUE;
    case 'WATCH':
      return MATCH_REVIEW_POINTER_STATES.WATCH;
    case 'REJECT':
      return MATCH_REVIEW_POINTER_STATES.REJECT;
    case 'INSUFFICIENT_EVIDENCE':
      return MATCH_REVIEW_POINTER_STATES.INSUFFICIENT_EVIDENCE;
    default:
      return MATCH_REVIEW_POINTER_STATES.PENDING;
  }
}

export function newReviewId(prefix = 'mrev'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
