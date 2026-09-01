/**
 * Live Match Review Pilot V1 — persist operator decisions on top of locked structural matcher.
 * Does NOT call evaluateReciprocalMatch or mutate matchJson / reciprocalBand.
 */
import { getPrismaClient } from '../prisma.js';
import { launchpadPersistentMarketGraph } from './capital/persistentMarketGraphStore.js';
import type { ListedGraphNode } from './capital/persistentMarketGraphStore.js';
import {
  MATCH_CONNECTION_EVENT_TYPES,
  MATCH_REVIEW_DECISIONS,
  MATCH_REVIEW_REASONS,
  decisionToPointerState,
  newReviewId,
  type MatchConnectionEventRecord,
  type MatchConnectionEventType,
  type MatchReviewDecision,
  type MatchReviewReason,
  type MatchReviewRecord,
  type MarketTruthSnapshot,
  type SemanticTruthSnapshot,
  type StructuralTruthSnapshot,
} from './matchReviewContracts.js';

const mem = {
  reviews: [] as MatchReviewRecord[],
  events: [] as MatchConnectionEventRecord[],
};

function nowIso() {
  return new Date().toISOString();
}

function prismaReady(): boolean {
  if (process.env.NODE_ENV === 'test') return false;
  try {
    const p = getPrismaClient() as any;
    return Boolean(p?.marketMatchReview);
  } catch {
    return false;
  }
}

function summarizeNode(node: ListedGraphNode) {
  return {
    nodeId: node.nodeId,
    label: node.label,
    actorRole: node.actorRole,
    marketSide: node.marketSide,
    evidenceConfidence: node.evidenceConfidence,
    hasSummary: (node.has || []).slice(0, 8).map((h) => ({
      type: h.type,
      label: h.label,
      basis: h.basis,
    })),
    wantsSummary: (node.wants || []).slice(0, 8).map((w) => ({
      type: w.type,
      label: w.label,
      basis: w.basis,
    })),
    geography: node.geographyLabels || [],
    sourceRef: node.sourceRef ?? null,
    sourceType: node.sourceType ?? null,
  };
}

function buildSemanticTruth(nodeA: ListedGraphNode, nodeB: ListedGraphNode): SemanticTruthSnapshot {
  return {
    layer: 'G1_G2',
    nodeA: summarizeNode(nodeA),
    nodeB: summarizeNode(nodeB),
  };
}

function buildStructuralTruth(matchRow: {
  pairKey: string;
  reciprocalBand: string;
  matcherVersion: string;
  match: any;
  computedAt: string;
  isStale: boolean;
}): StructuralTruthSnapshot {
  const m = matchRow.match || {};
  return {
    layer: 'MarketMatch_V1',
    immutable: true,
    pairKey: matchRow.pairKey,
    reciprocalBand: matchRow.reciprocalBand,
    matcherVersion: matchRow.matcherVersion || m.matcherVersion,
    aNeedsFromB: m.aNeedsFromB || [],
    bNeedsFromA: m.bNeedsFromA || [],
    geographicFit: m.geographicFit || 'UNKNOWN',
    constraintFit: m.constraintFit || 'UNKNOWN',
    timingFit: m.timingFit || 'UNKNOWN',
    evidenceConfidence: m.evidenceConfidence || 'WEAK',
    matchReasons: m.matchReasons || [],
    conflicts: m.conflicts || [],
    unknowns: m.unknowns || [],
    computedAt: matchRow.computedAt,
    isStale: matchRow.isStale,
  };
}

async function getMatchRow(pairKey: string) {
  const result = await launchpadPersistentMarketGraph.listMatches({ limit: 500 });
  return result.items.find((m) => m.pairKey === pairKey) || null;
}

async function persistReviewRow(row: MatchReviewRecord): Promise<boolean> {
  if (!prismaReady()) return false;
  try {
    const p = getPrismaClient() as any;
    await p.marketMatchReview.create({
      data: {
        id: row.id,
        pairKey: row.pairKey,
        nodeAId: row.nodeAId,
        nodeBId: row.nodeBId,
        decision: row.decision,
        reason: row.reason,
        note: row.note,
        reviewerId: row.reviewerId,
        semanticTruthJson: row.semanticTruth,
        structuralTruthJson: row.structuralTruth,
        marketTruthJson: row.marketTruth,
        createdAt: new Date(row.createdAt),
      },
    });
    return true;
  } catch {
    return false;
  }
}

async function persistConnectionEventRow(row: MatchConnectionEventRecord): Promise<boolean> {
  if (!prismaReady()) return false;
  try {
    const p = getPrismaClient() as any;
    await p.marketMatchConnectionEvent.create({
      data: {
        id: row.id,
        pairKey: row.pairKey,
        reviewId: row.reviewId,
        eventType: row.eventType,
        stageState: row.stageState,
        actorId: row.actorId,
        payloadJson: row.payloadJson ?? {},
        occurredAt: new Date(row.occurredAt),
      },
    });
    return true;
  } catch {
    return false;
  }
}

function appendConnectionEvent(params: {
  pairKey: string;
  reviewId?: string | null;
  eventType: MatchConnectionEventType;
  actorId?: string | null;
  payload?: unknown;
  stageState?: 'RECORDED' | 'UNKNOWN';
}) {
  const row: MatchConnectionEventRecord = {
    id: newReviewId('mcev'),
    pairKey: params.pairKey,
    reviewId: params.reviewId ?? null,
    eventType: params.eventType,
    stageState: params.stageState ?? 'RECORDED',
    actorId: params.actorId ?? null,
    payloadJson: params.payload ?? {},
    occurredAt: nowIso(),
    externalContact: false,
  };
  mem.events.push(row);
  void persistConnectionEventRow(row);
  return row;
}

export async function submitMatchReview(params: {
  pairKey: string;
  decision: MatchReviewDecision;
  reason?: MatchReviewReason | null;
  note?: string | null;
  reviewerId?: string | null;
  confirmed: boolean;
}) {
  if (!params.confirmed) {
    return {
      ok: false as const,
      requiresConfirmation: true,
      message:
        'Record operator match review? This captures market truth only — it does not contact anyone or change structural bands.',
      sends: false,
      externalContact: false,
    };
  }

  if (!MATCH_REVIEW_DECISIONS.includes(params.decision)) {
    return { ok: false as const, error: 'invalid_decision', sends: false };
  }
  if (params.reason && !MATCH_REVIEW_REASONS.includes(params.reason)) {
    return { ok: false as const, error: 'invalid_reason', sends: false };
  }

  const matchRow = await getMatchRow(params.pairKey);
  if (!matchRow) {
    return { ok: false as const, error: 'match_not_found', sends: false };
  }
  if (matchRow.isStale) {
    return {
      ok: false as const,
      error: 'match_stale',
      message: 'Match is stale after node changes — re-admit nodes before review.',
      sends: false,
    };
  }

  const nodeA = await launchpadPersistentMarketGraph.getNode(matchRow.nodeAId);
  const nodeB = await launchpadPersistentMarketGraph.getNode(matchRow.nodeBId);
  if (!nodeA || !nodeB) {
    return { ok: false as const, error: 'nodes_not_found', sends: false };
  }

  const reviewedAt = nowIso();
  const marketTruth: MarketTruthSnapshot = {
    layer: 'operator_review',
    decision: params.decision,
    reason: params.reason ?? null,
    note: params.note?.trim() || null,
    reviewedBy: params.reviewerId ?? null,
    reviewedAt,
  };

  const review: MatchReviewRecord = {
    id: newReviewId('mrev'),
    pairKey: params.pairKey,
    nodeAId: matchRow.nodeAId,
    nodeBId: matchRow.nodeBId,
    decision: params.decision,
    reason: params.reason ?? null,
    note: params.note?.trim() || null,
    reviewerId: params.reviewerId ?? null,
    semanticTruth: buildSemanticTruth(nodeA, nodeB),
    structuralTruth: buildStructuralTruth(matchRow),
    marketTruth,
    createdAt: reviewedAt,
  };

  mem.reviews.push(review);
  await persistReviewRow(review);

  // Pointer only — never mutate matchJson / reciprocalBand
  await launchpadPersistentMarketGraph.updateMatchReviewPointer(
    params.pairKey,
    decisionToPointerState(params.decision),
  );

  appendConnectionEvent({
    pairKey: params.pairKey,
    reviewId: review.id,
    eventType: 'MATCH_REVIEWED',
    actorId: params.reviewerId,
    payload: {
      decision: params.decision,
      reason: params.reason ?? null,
      structuralBand: matchRow.reciprocalBand,
    },
  });

  if (params.decision === 'PURSUE') {
    appendConnectionEvent({
      pairKey: params.pairKey,
      reviewId: review.id,
      eventType: 'MATCH_PURSUED',
      actorId: params.reviewerId,
      payload: { reason: params.reason ?? null },
    });
  }

  return {
    ok: true as const,
    review,
    structuralBandUnchanged: matchRow.reciprocalBand,
    sends: false,
    externalContact: false,
  };
}

export async function recordConnectionFunnelEvent(params: {
  pairKey: string;
  eventType: MatchConnectionEventType;
  actorId?: string | null;
  payload?: unknown;
  stageState?: 'RECORDED' | 'UNKNOWN';
  confirmed: boolean;
}) {
  if (!params.confirmed) {
    return {
      ok: false as const,
      requiresConfirmation: true,
      message: 'Record connection funnel event? No automatic outreach.',
      sends: false,
    };
  }
  if (!MATCH_CONNECTION_EVENT_TYPES.includes(params.eventType)) {
    return { ok: false as const, error: 'invalid_event_type', sends: false };
  }

  const matchRow = await getMatchRow(params.pairKey);
  if (!matchRow) {
    return { ok: false as const, error: 'match_not_found', sends: false };
  }

  const latestPursue = [...mem.reviews]
    .filter((r) => r.pairKey === params.pairKey && r.decision === 'PURSUE')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  const downstreamTypes: MatchConnectionEventType[] = [
    'CONNECTION_PREPARED',
    'CONNECTION_APPROVED',
    'CONNECTION_PRESENTED',
    'CONNECTION_SENT',
    'RESPONSE_RECEIVED',
    'CONVERSATION_STARTED',
    'QUALIFIED',
    'CONNECTED',
    'OUTCOME_RECORDED',
  ];
  if (downstreamTypes.includes(params.eventType) && !latestPursue) {
    return {
      ok: false as const,
      error: 'pursue_required',
      message: 'Connection funnel events require a prior PURSUE review decision.',
      sends: false,
    };
  }

  const ev = appendConnectionEvent({
    pairKey: params.pairKey,
    reviewId: latestPursue?.id ?? null,
    eventType: params.eventType,
    actorId: params.actorId,
    payload: params.payload,
    stageState: params.stageState,
  });

  return {
    ok: true as const,
    event: ev,
    sends: false,
    externalContact: false,
    autoOutreach: false,
  };
}

export function listMatchReviews(pairKey?: string) {
  const rows = pairKey ? mem.reviews.filter((r) => r.pairKey === pairKey) : [...mem.reviews];
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listConnectionEvents(pairKey?: string) {
  const rows = pairKey ? mem.events.filter((e) => e.pairKey === pairKey) : [...mem.events];
  return rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function buildPilotReviewStats() {
  const reviews = [...mem.reviews];
  const byDecision: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  const bandByDecision: Record<string, Record<string, number>> = {};

  for (const r of reviews) {
    byDecision[r.decision] = (byDecision[r.decision] || 0) + 1;
    if (r.reason) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
    const band = r.structuralTruth.reciprocalBand;
    if (!bandByDecision[band]) bandByDecision[band] = {};
    bandByDecision[band][r.decision] = (bandByDecision[band][r.decision] || 0) + 1;
  }

  const strong = reviews.filter((r) => r.structuralTruth.reciprocalBand === 'STRONG_RECIPROCAL');
  const oneWay = reviews.filter((r) => r.structuralTruth.reciprocalBand === 'ONE_WAY_STRONG');
  const pursued = reviews.filter((r) => r.decision === 'PURSUE');
  const pursuedWithResponse = pursued.filter((r) =>
    mem.events.some(
      (e) => e.pairKey === r.pairKey && e.eventType === 'RESPONSE_RECEIVED' && e.stageState === 'RECORDED',
    ),
  );
  const pursuedWithConversation = pursued.filter((r) =>
    mem.events.some(
      (e) => e.pairKey === r.pairKey && e.eventType === 'CONVERSATION_STARTED' && e.stageState === 'RECORDED',
    ),
  );

  return {
    candidatePairsReviewed: reviews.length,
    reviewDistribution: byDecision,
    rejectionReasons: byReason,
    structuralBandByOperatorDecision: bandByDecision,
    strongReciprocalReviewed: strong.length,
    strongReciprocalPursued: strong.filter((r) => r.decision === 'PURSUE').length,
    strongReciprocalPursueRate:
      strong.length > 0 ? strong.filter((r) => r.decision === 'PURSUE').length / strong.length : null,
    oneWayStrongReviewed: oneWay.length,
    oneWayStrongPursued: oneWay.filter((r) => r.decision === 'PURSUE').length,
    oneWayStrongPursueRate:
      oneWay.length > 0 ? oneWay.filter((r) => r.decision === 'PURSUE').length / oneWay.length : null,
    pursuedMatches: pursued.length,
    pursuedWithResponse: pursuedWithResponse.length,
    pursuedWithConversation: pursuedWithConversation.length,
    unauthorizedContact: 0,
    autonomousOutreach: 0,
    note: 'Operator acceptance precision of structurally strong matches is the primary pilot metric.',
  };
}

export function __resetMatchReviewMemory() {
  mem.reviews.length = 0;
  mem.events.length = 0;
}
