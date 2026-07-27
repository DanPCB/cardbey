/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  parseExecutionCheckpointBody,
  toExecutionCheckpointHttpResponse,
} from '../handleExecutionCheckpoint.js';

describe('handleExecutionCheckpoint helpers', () => {
  it('parseExecutionCheckpointBody extracts stepId, response, and data', () => {
    const parsed = parseExecutionCheckpointBody({
      stepId: ' s1 ',
      response: 'Skip',
      data: { logoUrl: 'https://x' },
      extra: true,
    });
    expect(parsed).toEqual({
      stepId: 's1',
      response: 'Skip',
      data: { logoUrl: 'https://x' },
    });
  });

  it('toExecutionCheckpointHttpResponse maps success envelope', () => {
    const http = toExecutionCheckpointHttpResponse(
      {
        ok: true,
        missionId: 'm1',
        stepId: 's1',
        orchestration: { stepsRun: 2, stoppedReason: null, status: 'executing' },
        missionStatus: 'executing',
      },
      'm1',
    );
    expect(http.statusCode).toBe(200);
    expect(http.body).toMatchObject({
      ok: true,
      resumed: true,
      executionId: 'm1',
      missionId: 'm1',
      stepId: 's1',
    });
  });

  it('toExecutionCheckpointHttpResponse maps error envelope', () => {
    const http = toExecutionCheckpointHttpResponse(
      { ok: false, statusCode: 409, error: 'step_not_awaiting', message: 'nope' },
      'm1',
    );
    expect(http.statusCode).toBe(409);
    expect(http.body.ok).toBe(false);
    expect(http.body.error).toBe('step_not_awaiting');
  });
});
