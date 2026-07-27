/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { MissionTransitionError } from '../missionTransitionError.js';

describe('MissionTransitionError', () => {
  it('maps P2025-style missing record to structured 404 payload', () => {
    const err = new MissionTransitionError({
      code: 'MISSION_RECORD_NOT_FOUND',
      message: 'Authoritative mission record not found.',
      missionId: 'mission-1',
      currentState: 'queued',
      failedTransition: 'queued -> executing',
    });

    const json = err.toJSON();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('MISSION_RECORD_NOT_FOUND');
    expect(json.error.failedTransition).toBe('queued -> executing');
    expect(err.statusCode).toBe(404);
  });

  it('maps invalid state to 409', () => {
    const err = new MissionTransitionError({
      code: 'INVALID_MISSION_STATE',
      message: 'Cannot transition',
      missionId: 'mission-1',
      currentState: 'completed',
      requiredState: 'queued',
    });
    expect(err.statusCode).toBe(409);
  });
});
