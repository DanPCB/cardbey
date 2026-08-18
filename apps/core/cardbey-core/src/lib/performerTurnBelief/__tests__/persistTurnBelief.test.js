import { describe, it, expect } from 'vitest';
import {
  buildTurnBeliefFromIntake,
  createEmptyTurnBelief,
  isTurnBelief,
  PERFORMER_STATUS,
  persistTurnBelief,
  persistTurnBeliefOnDispatchDeps,
  readTurnBeliefFromContext,
  serializeTurnBeliefSnapshot,
} from '../index.js';

describe('persistTurnBelief', () => {
  it('serializes and validates TurnBelief snapshots', () => {
    const belief = buildTurnBeliefFromIntake({
      goal: 'Create store: NOODLE hut',
      businessName: 'NOODLE hut',
      ocrText: 'NOODLE hut\n123 Main St',
    });
    const snapshot = serializeTurnBeliefSnapshot(belief);
    expect(isTurnBelief(snapshot)).toBe(true);
    expect(snapshot?.turnBeliefId).toBe(belief.turnBeliefId);
    expect(snapshot).not.toBe(belief);
  });

  it('persists belief onto intentSourceContext and missionContext without touching governance', () => {
    const belief = createEmptyTurnBelief({
      goal: 'Create store: Coffee Co',
      status: PERFORMER_STATUS.READY_TO_PROPOSE,
      identity: {
        name: 'Coffee Co',
        category: 'Cafe',
        location: 'VIC',
        confidence: 0.8,
        evidenceRefIds: ['ocr'],
      },
    });
    const intentSourceContext = {
      safeExecutionTrace: { proposedAction: 'create_store', confirmationState: 'pending' },
      missionContext: {},
    };

    const written = persistTurnBelief({
      turnBelief: belief,
      intentSourceContext,
      missionContext: intentSourceContext.missionContext,
    });

    expect(isTurnBelief(written)).toBe(true);
    expect(isTurnBelief(intentSourceContext.turnBelief)).toBe(true);
    expect(intentSourceContext.turnBeliefId).toBe(belief.turnBeliefId);
    expect(intentSourceContext.performerStatus).toBe(PERFORMER_STATUS.READY_TO_PROPOSE);
    expect(isTurnBelief(intentSourceContext.missionContext.turnBelief)).toBe(true);
    expect(intentSourceContext.safeExecutionTrace).toEqual({
      proposedAction: 'create_store',
      confirmationState: 'pending',
    });
    expect(readTurnBeliefFromContext(intentSourceContext)?.goal).toBe('Create store: Coffee Co');
  });

  it('persistTurnBeliefOnDispatchDeps creates intentSourceContext and mirrors deps.turnBelief', () => {
    const belief = buildTurnBeliefFromIntake({
      goal: 'Create store: Mộc',
      businessName: 'Mộc',
      ocrText: 'Mộc Coffee\nMelbourne',
    });
    const deps = { turnBelief: belief };

    const snapshot = persistTurnBeliefOnDispatchDeps(deps, belief);

    expect(isTurnBelief(snapshot)).toBe(true);
    expect(isTurnBelief(deps.intentSourceContext?.turnBelief)).toBe(true);
    expect(deps.intentSourceContext?.turnBeliefId).toBe(belief.turnBeliefId);
    expect(readTurnBeliefFromContext(deps.intentSourceContext)?.identity?.name).toBe(
      belief.identity?.name,
    );
  });
});
