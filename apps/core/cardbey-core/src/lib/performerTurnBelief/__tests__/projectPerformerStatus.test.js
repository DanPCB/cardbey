import { describe, it, expect } from 'vitest';
import {
  PERFORMER_STATUS,
  createEmptyTurnBelief,
  buildIdentityGoalMismatchConflict,
  patchTurnBelief,
  projectPerformerStatus,
  performerStatusResponseFields,
} from '../index.js';

describe('projectPerformerStatus', () => {
  it('projects BLOCKED belief with celebratory copy forbidden', () => {
    let belief = createEmptyTurnBelief({
      goal: 'Create store: NOODLE',
      status: PERFORMER_STATUS.READY_TO_PROPOSE,
    });
    belief = patchTurnBelief(belief, {
      conflicts: [
        buildIdentityGoalMismatchConflict({
          goalName: 'NOODLE',
          evidenceName: 'Coffee',
        }),
      ],
    });

    const projected = projectPerformerStatus(belief);

    expect(projected.status).toBe(PERFORMER_STATUS.BLOCKED);
    expect(projected.label).toBe('Blocked');
    expect(projected.allowsCelebratoryCopy).toBe(false);
    expect(projected.forbidsCatalogInvention).toBe(true);
    expect(projected.canDispatchTools).toBe(false);
  });

  it('projects READY_TO_PROPOSE without runtime overrides', () => {
    const belief = createEmptyTurnBelief({
      goal: 'Create store: NOODLE hut',
      status: PERFORMER_STATUS.READY_TO_PROPOSE,
      userVisibleSummary: 'Ready to propose a sparse store.',
    });

    const projected = projectPerformerStatus(belief);

    expect(projected.status).toBe(PERFORMER_STATUS.READY_TO_PROPOSE);
    expect(projected.label).toBe('Ready to propose');
    expect(projected.canDispatchTools).toBe(true);
    expect(projected.allowsCelebratoryCopy).toBe(false);
    expect(projected.userVisibleSummary).toBe('Ready to propose a sparse store.');
  });

  it('overrides READY_TO_PROPOSE to RUNNING when missionRunning', () => {
    const belief = createEmptyTurnBelief({
      goal: 'Create store: NOODLE hut',
      status: PERFORMER_STATUS.READY_TO_PROPOSE,
    });

    const projected = projectPerformerStatus(belief, { missionRunning: true });

    expect(projected.status).toBe(PERFORMER_STATUS.RUNNING);
    expect(projected.label).toBe('Working');
    expect(projected.allowsCelebratoryCopy).toBe(true);
    expect(projected.canDispatchTools).toBe(true);
  });

  it('keeps BLOCKED when missionRunning (no celebratory override)', () => {
    let belief = createEmptyTurnBelief({
      goal: 'Create store: NOODLE',
      status: PERFORMER_STATUS.READY_TO_PROPOSE,
    });
    belief = patchTurnBelief(belief, {
      conflicts: [
        buildIdentityGoalMismatchConflict({
          goalName: 'NOODLE',
          evidenceName: 'Coffee',
        }),
      ],
    });

    const projected = projectPerformerStatus(belief, { missionRunning: true });

    expect(projected.status).toBe(PERFORMER_STATUS.BLOCKED);
    expect(projected.allowsCelebratoryCopy).toBe(false);
  });

  it('maps awaitingConfirm to AWAITING_CONFIRM', () => {
    const belief = createEmptyTurnBelief({
      goal: 'Create store: NOODLE hut',
      status: PERFORMER_STATUS.READY_TO_PROPOSE,
    });

    const projected = projectPerformerStatus(belief, { awaitingConfirm: true });

    expect(projected.status).toBe(PERFORMER_STATUS.AWAITING_CONFIRM);
    expect(projected.allowsCelebratoryCopy).toBe(false);
    expect(projected.forbidsCatalogInvention).toBe(true);
  });

  it('performerStatusResponseFields exposes chat/inspector keys', () => {
    const belief = createEmptyTurnBelief({
      status: PERFORMER_STATUS.READY_TO_PROPOSE,
    });
    const fields = performerStatusResponseFields(
      projectPerformerStatus(belief, { missionRunning: true }),
    );

    expect(fields).toMatchObject({
      performerStatus: PERFORMER_STATUS.RUNNING,
      performerStatusLabel: 'Working',
      allowsCelebratoryCopy: true,
    });
  });
});
