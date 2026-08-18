import { describe, it, expect } from 'vitest';
import {
  PERFORMER_STATUS,
  allowsCelebratoryCopy,
  canDispatchTools,
  forbidsCatalogInvention,
  createEmptyTurnBelief,
  hasHardConflict,
  turnBeliefAllowsDispatch,
  buildIdentityGoalMismatchConflict,
  patchTurnBelief,
  TURN_BELIEF_SCHEMA_VERSION,
} from '../index.js';

describe('Performer P0 TurnBelief contract', () => {
  it('creates empty belief with NEEDS_EVIDENCE', () => {
    const b = createEmptyTurnBelief({ goal: 'Create store: NOODLE', missionId: 'm1' });
    expect(b.schemaVersion).toBe(TURN_BELIEF_SCHEMA_VERSION);
    expect(b.status).toBe(PERFORMER_STATUS.NEEDS_EVIDENCE);
    expect(b.offerings).toEqual([]);
    expect(turnBeliefAllowsDispatch(b)).toBe(false);
    expect(allowsCelebratoryCopy(b.status)).toBe(false);
  });

  it('hard identity conflict forces BLOCKED and blocks dispatch', () => {
    let b = createEmptyTurnBelief({
      goal: 'Create store: NOODLE',
      status: PERFORMER_STATUS.READY_TO_PROPOSE,
    });
    b = patchTurnBelief(b, {
      conflicts: [
        buildIdentityGoalMismatchConflict({
          goalName: 'NOODLE',
          evidenceName: 'Coffee',
          evidenceRefIds: ['ev1'],
        }),
      ],
    });
    expect(hasHardConflict(b)).toBe(true);
    expect(b.status).toBe(PERFORMER_STATUS.BLOCKED);
    expect(turnBeliefAllowsDispatch(b)).toBe(false);
    expect(forbidsCatalogInvention(b.status)).toBe(true);
  });

  it('READY_TO_PROPOSE without hard conflict may dispatch', () => {
    const b = createEmptyTurnBelief({
      goal: 'Create store: NOODLE hut',
      status: PERFORMER_STATUS.READY_TO_PROPOSE,
      identity: { name: 'NOODLE hut', category: 'Food & drink', location: 'VIC', confidence: 0.8, evidenceRefIds: ['e1'] },
      confidence: 0.8,
      userVisibleSummary: 'I see NOODLE hut from your card; ready to propose a sparse store.',
    });
    expect(canDispatchTools(b.status)).toBe(true);
    expect(turnBeliefAllowsDispatch(b)).toBe(true);
  });

  it('celebratory copy only for RUNNING or DONE', () => {
    expect(allowsCelebratoryCopy(PERFORMER_STATUS.NEEDS_EVIDENCE)).toBe(false);
    expect(allowsCelebratoryCopy(PERFORMER_STATUS.BLOCKED)).toBe(false);
    expect(allowsCelebratoryCopy(PERFORMER_STATUS.AWAITING_CONFIRM)).toBe(false);
    expect(allowsCelebratoryCopy(PERFORMER_STATUS.RUNNING)).toBe(true);
    expect(allowsCelebratoryCopy(PERFORMER_STATUS.DONE)).toBe(true);
  });
});
