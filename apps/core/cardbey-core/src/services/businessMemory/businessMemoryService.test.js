import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildBusinessSnapshotId,
  recordBusinessObservation,
  recordBusinessOpportunities,
  recordBusinessDecision,
  recordBusinessAction,
  updateBusinessActionStatus,
  recordBusinessOutcome,
  syncBusinessMemorySnapshot,
  getBusinessMemorySummary,
} from './businessMemoryService.js';
import { buildLearnedSignals, inferBusinessOutcomeType } from './businessMemoryLearnedSignals.js';

function makePrisma() {
  const store = {
    observations: new Map(),
    opportunities: new Map(),
    decisions: [],
    actions: new Map(),
    outcomes: new Map(),
    businesses: new Map([['store-1', { id: 'store-1', userId: 'owner-1' }]]),
  };

  let obsSeq = 0;
  let oppSeq = 0;
  let decSeq = 0;
  let actSeq = 0;
  let outSeq = 0;

  const prisma = {
    business: {
      findUnique: async ({ where }) => store.businesses.get(where.id) ?? null,
    },
    businessObservationEvent: {
      findUnique: async ({ where }) => {
        const key = where.business_observation_store_snapshot;
        if (!key) return null;
        return [...store.observations.values()].find(
          (r) => r.storeId === key.storeId && r.snapshotId === key.snapshotId,
        ) ?? null;
      },
      create: async ({ data }) => {
        const row = { id: `obs-${++obsSeq}`, ...data };
        store.observations.set(row.id, row);
        return row;
      },
      findMany: async () => [...store.observations.values()],
    },
    businessOpportunityEvent: {
      findUnique: async ({ where }) => {
        if (where.id) return store.opportunities.get(where.id) ?? null;
        const key = where.business_opportunity_store_opp_snapshot;
        if (!key) return null;
        return [...store.opportunities.values()].find(
          (r) =>
            r.storeId === key.storeId &&
            r.opportunityId === key.opportunityId &&
            r.snapshotId === key.snapshotId,
        ) ?? null;
      },
      create: async ({ data }) => {
        const row = { id: `opp-${++oppSeq}`, ...data };
        store.opportunities.set(row.id, row);
        return row;
      },
      findMany: async () => [...store.opportunities.values()],
    },
    businessDecisionEvent: {
      create: async ({ data }) => {
        const row = { id: `dec-${++decSeq}`, ...data };
        store.decisions.push(row);
        return row;
      },
      findMany: async ({ include } = {}) => {
        if (!include?.opportunityEvent) return store.decisions;
        return store.decisions.map((d) => ({
          ...d,
          opportunityEvent: [...store.opportunities.values()].find((o) => o.id === d.opportunityEventId),
        }));
      },
    },
    businessActionEvent: {
      findUnique: async ({ where }) => {
        if (where.id) return store.actions.get(where.id) ?? null;
        if (where.missionId) {
          return [...store.actions.values()].find((a) => a.missionId === where.missionId) ?? null;
        }
        return null;
      },
      create: async ({ data }) => {
        const row = {
          id: `act-${++actSeq}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        store.actions.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = store.actions.get(where.id);
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
      findMany: async () => [...store.actions.values()],
    },
    businessOutcomeEvent: {
      findUnique: async ({ where }) => {
        if (where.missionId) {
          return [...store.outcomes.values()].find((o) => o.missionId === where.missionId) ?? null;
        }
        return null;
      },
      create: async ({ data }) => {
        const row = { id: `out-${++outSeq}`, ...data };
        store.outcomes.set(row.id, row);
        return row;
      },
      findMany: async ({ include } = {}) => {
        const rows = [...store.outcomes.values()];
        if (!include?.actionEvent) return rows;
        return rows.map((o) => ({
          ...o,
          actionEvent: store.actions.get(o.actionEventId),
        }));
      },
    },
  };

  return { prisma, store };
}

const snapshot = {
  storeId: 'store-1',
  ownerId: 'owner-1',
  capturedAt: '2026-06-07T12:00:00.000Z',
  healthScore: 55,
  observations: ['No active promotion.'],
};

const opportunity = {
  id: 'opp_no_active_offer',
  category: 'offer',
  priority: 82,
  severity: 'attention',
  title: 'No active promotion',
  reason: 'No active offers.',
  evidence: ['activeOfferCount:0'],
  recommendedAction: { type: 'create_offer', intent: 'create_offer' },
};

describe('businessMemoryLearnedSignals', () => {
  it('builds factual signals', () => {
    const signals = buildLearnedSignals({
      decisions: [{ decision: 'dismissed', opportunityEvent: { category: 'loyalty' } }],
      actions: [{ actionType: 'create_offer', status: 'completed' }],
      outcomes: [{ outcomeType: 'offer_created' }],
    });
    expect(signals.some((s) => s.includes('create_offer'))).toBe(true);
    expect(signals.some((s) => s.includes('loyalty'))).toBe(true);
  });

  it('infers outcome types', () => {
    expect(inferBusinessOutcomeType({ actionType: 'create_offer', missionStatus: 'completed' })).toBe(
      'offer_created',
    );
    expect(inferBusinessOutcomeType({ actionType: 'generate_video', missionStatus: 'failed' })).toBe(
      'mission_failed',
    );
  });
});

describe('businessMemoryService', () => {
  let prisma;
  beforeEach(() => {
    prisma = makePrisma().prisma;
  });

  it('modelAvailable skips when business memory delegates are absent', async () => {
    const bare = { business: prisma.business };
    const result = await recordBusinessObservation(snapshot, bare);
    expect(result.skipped).toBe(true);
    expect(result.id).toBeNull();
  });

  it('modelAvailable detects all business memory delegates on full prisma client', async () => {
    const models = [
      'businessObservationEvent',
      'businessOpportunityEvent',
      'businessDecisionEvent',
      'businessActionEvent',
      'businessOutcomeEvent',
    ];
    for (const model of models) {
      const delegate = prisma[model];
      expect(delegate).toBeTruthy();
      expect(
        typeof delegate.findUnique === 'function' ||
          typeof delegate.create === 'function',
      ).toBe(true);
    }
    const result = await recordBusinessObservation(snapshot, prisma);
    expect(result.skipped).toBeUndefined();
    expect(result.id).toBeTruthy();
  });

  it('records observation once per snapshot', async () => {
    const a = await recordBusinessObservation(snapshot, prisma);
    const b = await recordBusinessObservation(snapshot, prisma);
    expect(a.id).toBe(b.id);
    expect(buildBusinessSnapshotId(snapshot.storeId, snapshot.capturedAt)).toBe(
      'store-1:2026-06-07T12:00:00.000Z',
    );
  });

  it('dedupes opportunity events by storeId+opportunityId+snapshotId', async () => {
    const obs = await recordBusinessObservation(snapshot, prisma);
    const first = await recordBusinessOpportunities(snapshot, [opportunity], obs.id, prisma);
    const second = await recordBusinessOpportunities(snapshot, [opportunity], obs.id, prisma);
    expect(first.rows).toHaveLength(1);
    expect(second.rows).toHaveLength(1);
    expect(first.rows[0].id).toBe(second.rows[0].id);
  });

  it('records prepare decision and action', async () => {
    const sync = await syncBusinessMemorySnapshot(snapshot, [opportunity], prisma);
    const oppEventId = sync.opportunityEventIds[opportunity.id];
    const decision = await recordBusinessDecision(
      {
        opportunityEventId: oppEventId,
        decision: 'prepared',
        source: 'opportunity_briefing_card',
        ownerId: 'owner-1',
      },
      prisma,
    );
    const action = await recordBusinessAction(
      {
        opportunityEventId: oppEventId,
        decisionEventId: decision.id,
        actionType: 'create_offer',
        intent: 'create_offer',
        status: 'prepared',
        ownerId: 'owner-1',
      },
      prisma,
    );
    expect(decision.decision).toBe('prepared');
    expect(action.status).toBe('prepared');
  });

  it('links missionId without duplicating action rows', async () => {
    const sync = await syncBusinessMemorySnapshot(snapshot, [opportunity], prisma);
    const oppEventId = sync.opportunityEventIds[opportunity.id];
    const action = await recordBusinessAction(
      {
        opportunityEventId: oppEventId,
        actionType: 'create_offer',
        intent: 'create_offer',
        status: 'prepared',
        ownerId: 'owner-1',
      },
      prisma,
    );
    const linked = await updateBusinessActionStatus(
      { actionEventId: action.id, missionId: 'mission-1', status: 'started', ownerId: 'owner-1' },
      prisma,
    );
    expect(linked.missionId).toBe('mission-1');
    expect(linked.status).toBe('started');

    const dup = await recordBusinessAction(
      {
        opportunityEventId: oppEventId,
        missionId: 'mission-1',
        actionType: 'create_offer',
        intent: 'create_offer',
        status: 'started',
        ownerId: 'owner-1',
      },
      prisma,
    );
    expect(dup.id).toBe(linked.id);
  });

  it('records completion outcome once per mission', async () => {
    const sync = await syncBusinessMemorySnapshot(snapshot, [opportunity], prisma);
    const oppEventId = sync.opportunityEventIds[opportunity.id];
    const action = await recordBusinessAction(
      {
        opportunityEventId: oppEventId,
        missionId: 'mission-2',
        actionType: 'create_offer',
        intent: 'create_offer',
        status: 'completed',
        ownerId: 'owner-1',
      },
      prisma,
    );
    const out1 = await recordBusinessOutcome(
      {
        opportunityEventId: oppEventId,
        actionEventId: action.id,
        missionId: 'mission-2',
        outcomeType: 'offer_created',
        outcomeJson: { ok: true },
        ownerId: 'owner-1',
      },
      prisma,
    );
    const out2 = await recordBusinessOutcome(
      {
        opportunityEventId: oppEventId,
        actionEventId: action.id,
        missionId: 'mission-2',
        outcomeType: 'offer_created',
        outcomeJson: { ok: true },
        ownerId: 'owner-1',
      },
      prisma,
    );
    expect(out1.id).toBe(out2.id);
  });

  it('returns memory summary with learned signals', async () => {
    const sync = await syncBusinessMemorySnapshot(snapshot, [opportunity], prisma);
    const oppEventId = sync.opportunityEventIds[opportunity.id];
    await recordBusinessDecision(
      {
        opportunityEventId: oppEventId,
        decision: 'dismissed',
        source: 'opportunity_briefing_card',
        ownerId: 'owner-1',
      },
      prisma,
    );
    await recordBusinessAction(
      {
        opportunityEventId: oppEventId,
        actionType: 'generate_video',
        intent: 'generate_video',
        status: 'failed',
        ownerId: 'owner-1',
      },
      prisma,
    );
    const summary = await getBusinessMemorySummary('store-1', 'owner-1', prisma);
    expect(summary.recentObservations.length).toBeGreaterThan(0);
    expect(summary.learnedSignals.length).toBeGreaterThan(0);
  });
});
