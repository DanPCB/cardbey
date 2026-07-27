/**
 * Phase 4 — Business Memory persistence (facts only; no autonomous execution).
 * Integrates with Mission Runtime via missionId linkage on action/outcome rows.
 */
import { getPrismaClient } from '../../lib/prisma.js';
import { buildLearnedSignals, inferBusinessOutcomeType } from './businessMemoryLearnedSignals.js';

const RECENT_LIMIT = 20;

export function buildBusinessSnapshotId(storeId, capturedAt) {
  const sid = String(storeId ?? '').trim();
  const at = String(capturedAt ?? '').trim();
  return `${sid}:${at}`;
}

function jsonStringify(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return 'null';
  }
}

function jsonParse(raw, fallback = null) {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function assertStoreOwner(prisma, storeId, ownerId) {
  const sid = String(storeId ?? '').trim();
  const oid = String(ownerId ?? '').trim();
  if (!sid || !oid) {
    const err = new Error('storeId and ownerId are required');
    err.statusCode = 400;
    throw err;
  }
  const store = await prisma.business.findUnique({
    where: { id: sid },
    select: { id: true, userId: true },
  });
  if (!store) {
    const err = new Error('Store not found');
    err.statusCode = 404;
    throw err;
  }
  const isDevAdmin = process.env.NODE_ENV !== 'production';
  if (!isDevAdmin && store.userId !== oid) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }
  return { storeId: sid, ownerId: oid };
}

function modelAvailable(prisma, modelName) {
  const delegate = prisma?.[modelName];
  return Boolean(
    delegate &&
      (typeof delegate.findFirst === 'function' ||
        typeof delegate.findUnique === 'function' ||
        typeof delegate.create === 'function'),
  );
}

/**
 * @param {object} snapshot — BusinessAwarenessSnapshot shape from dashboard
 */
export async function recordBusinessObservation(snapshot, prisma = getPrismaClient()) {
  if (!modelAvailable(prisma, 'businessObservationEvent')) {
    return { id: null, snapshotId: buildBusinessSnapshotId(snapshot?.storeId, snapshot?.capturedAt), skipped: true };
  }
  await assertStoreOwner(prisma, snapshot.storeId, snapshot.ownerId);
  const snapshotId = buildBusinessSnapshotId(snapshot.storeId, snapshot.capturedAt);

  const existing = await prisma.businessObservationEvent.findUnique({
    where: {
      business_observation_store_snapshot: {
        storeId: snapshot.storeId,
        snapshotId,
      },
    },
  });
  if (existing) return existing;

  return prisma.businessObservationEvent.create({
    data: {
      storeId: snapshot.storeId,
      ownerId: snapshot.ownerId,
      snapshotId,
      healthScore: Math.round(Number(snapshot.healthScore) || 0),
      observationsJson: jsonStringify(snapshot.observations ?? []),
    },
  });
}

/**
 * @param {object} snapshot
 * @param {Array<object>} opportunities
 * @param {string} observationEventId
 */
export async function recordBusinessOpportunities(
  snapshot,
  opportunities,
  observationEventId,
  prisma = getPrismaClient(),
) {
  if (!modelAvailable(prisma, 'businessOpportunityEvent')) {
    return { rows: [], skipped: true };
  }
  await assertStoreOwner(prisma, snapshot.storeId, snapshot.ownerId);
  const snapshotId = buildBusinessSnapshotId(snapshot.storeId, snapshot.capturedAt);
  const rows = [];

  for (const opp of opportunities ?? []) {
    const opportunityId = String(opp.id ?? '').trim();
    if (!opportunityId) continue;

    const existing = await prisma.businessOpportunityEvent.findUnique({
      where: {
        business_opportunity_store_opp_snapshot: {
          storeId: snapshot.storeId,
          opportunityId,
          snapshotId,
        },
      },
    });
    if (existing) {
      rows.push(existing);
      continue;
    }

    const created = await prisma.businessOpportunityEvent.create({
      data: {
        storeId: snapshot.storeId,
        ownerId: snapshot.ownerId,
        observationEventId,
        snapshotId,
        opportunityId,
        category: String(opp.category ?? ''),
        priority: Number(opp.priority) || 0,
        severity: String(opp.severity ?? 'info'),
        title: String(opp.title ?? ''),
        reason: String(opp.reason ?? ''),
        evidenceJson: jsonStringify(opp.evidence ?? []),
        recommendedActionJson: jsonStringify(opp.recommendedAction ?? {}),
      },
    });
    rows.push(created);
  }

  return { rows };
}

export async function recordBusinessDecision(input, prisma = getPrismaClient()) {
  if (!modelAvailable(prisma, 'businessDecisionEvent')) {
    return { id: null, skipped: true };
  }
  const opportunityEvent = await prisma.businessOpportunityEvent.findUnique({
    where: { id: input.opportunityEventId },
  });
  if (!opportunityEvent) {
    const err = new Error('Opportunity event not found');
    err.statusCode = 404;
    throw err;
  }
  await assertStoreOwner(prisma, opportunityEvent.storeId, input.ownerId ?? opportunityEvent.ownerId);

  return prisma.businessDecisionEvent.create({
    data: {
      storeId: opportunityEvent.storeId,
      ownerId: input.ownerId ?? opportunityEvent.ownerId,
      opportunityEventId: opportunityEvent.id,
      decision: String(input.decision ?? 'prepared'),
      source: String(input.source ?? 'system'),
    },
  });
}

export async function recordBusinessAction(input, prisma = getPrismaClient()) {
  if (!modelAvailable(prisma, 'businessActionEvent')) {
    return { id: null, skipped: true };
  }
  const opportunityEvent = await prisma.businessOpportunityEvent.findUnique({
    where: { id: input.opportunityEventId },
  });
  if (!opportunityEvent) {
    const err = new Error('Opportunity event not found');
    err.statusCode = 404;
    throw err;
  }
  await assertStoreOwner(prisma, opportunityEvent.storeId, input.ownerId ?? opportunityEvent.ownerId);

  const missionId = typeof input.missionId === 'string' && input.missionId.trim() ? input.missionId.trim() : null;
  if (missionId) {
    const byMission = await prisma.businessActionEvent.findUnique({ where: { missionId } });
    if (byMission) return byMission;
  }

  return prisma.businessActionEvent.create({
    data: {
      storeId: opportunityEvent.storeId,
      ownerId: input.ownerId ?? opportunityEvent.ownerId,
      opportunityEventId: opportunityEvent.id,
      decisionEventId: input.decisionEventId ?? null,
      missionId,
      actionType: String(input.actionType ?? ''),
      intent: String(input.intent ?? ''),
      status: String(input.status ?? 'prepared'),
    },
  });
}

export async function updateBusinessActionStatus(
  { actionEventId, missionId, status, ownerId },
  prisma = getPrismaClient(),
) {
  if (!modelAvailable(prisma, 'businessActionEvent')) {
    return { id: null, skipped: true };
  }

  let row = null;
  if (actionEventId) {
    row = await prisma.businessActionEvent.findUnique({ where: { id: actionEventId } });
  }
  if (!row && missionId) {
    row = await prisma.businessActionEvent.findUnique({ where: { missionId: String(missionId).trim() } });
  }
  if (!row) {
    const err = new Error('Action event not found');
    err.statusCode = 404;
    throw err;
  }
  if (ownerId) await assertStoreOwner(prisma, row.storeId, ownerId);

  const mid = missionId && String(missionId).trim() ? String(missionId).trim() : row.missionId;
  if (mid && mid !== row.missionId) {
    const conflict = await prisma.businessActionEvent.findUnique({ where: { missionId: mid } });
    if (conflict && conflict.id !== row.id) return conflict;
  }

  return prisma.businessActionEvent.update({
    where: { id: row.id },
    data: {
      status: String(status ?? row.status),
      ...(mid ? { missionId: mid } : {}),
    },
  });
}

export async function recordBusinessOutcome(input, prisma = getPrismaClient()) {
  if (!modelAvailable(prisma, 'businessOutcomeEvent')) {
    return { id: null, skipped: true };
  }

  const missionId = typeof input.missionId === 'string' && input.missionId.trim() ? input.missionId.trim() : null;
  if (missionId) {
    const existing = await prisma.businessOutcomeEvent.findUnique({ where: { missionId } });
    if (existing) return existing;
  }

  const actionEvent = await prisma.businessActionEvent.findUnique({
    where: { id: input.actionEventId },
  });
  if (!actionEvent) {
    const err = new Error('Action event not found');
    err.statusCode = 404;
    throw err;
  }
  await assertStoreOwner(prisma, actionEvent.storeId, input.ownerId ?? actionEvent.ownerId);

  return prisma.businessOutcomeEvent.create({
    data: {
      storeId: actionEvent.storeId,
      ownerId: input.ownerId ?? actionEvent.ownerId,
      opportunityEventId: input.opportunityEventId ?? actionEvent.opportunityEventId,
      actionEventId: actionEvent.id,
      missionId: missionId ?? actionEvent.missionId ?? null,
      outcomeType: String(input.outcomeType ?? 'unknown'),
      outcomeJson: jsonStringify(input.outcomeJson ?? {}),
      measuredAt: input.measuredAt ? new Date(input.measuredAt) : new Date(),
    },
  });
}

export async function syncBusinessMemorySnapshot(snapshot, opportunities, prisma = getPrismaClient()) {
  const observation = await recordBusinessObservation(snapshot, prisma);
  if (!observation?.id) {
    return {
      observationEventId: null,
      snapshotId: observation?.snapshotId ?? buildBusinessSnapshotId(snapshot?.storeId, snapshot?.capturedAt),
      opportunityEventIds: {},
      skipped: true,
    };
  }
  const { rows } = await recordBusinessOpportunities(snapshot, opportunities, observation.id, prisma);
  const opportunityEventIds = {};
  for (const row of rows) {
    opportunityEventIds[row.opportunityId] = row.id;
  }
  return {
    observationEventId: observation.id,
    snapshotId: observation.snapshotId,
    opportunityEventIds,
  };
}

export async function getBusinessMemorySummary(storeId, ownerId, prisma = getPrismaClient()) {
  if (!modelAvailable(prisma, 'businessObservationEvent')) {
    return {
      recentObservations: [],
      recentOpportunities: [],
      recentDecisions: [],
      recentActions: [],
      recentOutcomes: [],
      learnedSignals: [],
      skipped: true,
    };
  }
  await assertStoreOwner(prisma, storeId, ownerId);

  const where = { storeId, ownerId };

  const [recentObservations, recentOpportunities, recentDecisions, recentActions, recentOutcomes] =
    await Promise.all([
      prisma.businessObservationEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: RECENT_LIMIT,
      }),
      prisma.businessOpportunityEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: RECENT_LIMIT,
      }),
      prisma.businessDecisionEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: RECENT_LIMIT,
        include: { opportunityEvent: { select: { category: true, opportunityId: true } } },
      }),
      prisma.businessActionEvent.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: RECENT_LIMIT,
      }),
      prisma.businessOutcomeEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: RECENT_LIMIT,
        include: { actionEvent: { select: { actionType: true } } },
      }),
    ]);

  const learnedSignals = buildLearnedSignals({
    decisions: recentDecisions,
    actions: recentActions,
    outcomes: recentOutcomes,
  });

  const mapObservation = (row) => ({
    ...row,
    observations: jsonParse(row.observationsJson, []),
  });
  const mapOpportunity = (row) => ({
    ...row,
    evidence: jsonParse(row.evidenceJson, []),
    recommendedAction: jsonParse(row.recommendedActionJson, {}),
  });
  const mapOutcome = (row) => ({
    ...row,
    outcome: jsonParse(row.outcomeJson, {}),
  });

  return {
    recentObservations: recentObservations.map(mapObservation),
    recentOpportunities: recentOpportunities.map(mapOpportunity),
    recentDecisions,
    recentActions,
    recentOutcomes: recentOutcomes.map(mapOutcome),
    learnedSignals,
  };
}

export { inferBusinessOutcomeType };
