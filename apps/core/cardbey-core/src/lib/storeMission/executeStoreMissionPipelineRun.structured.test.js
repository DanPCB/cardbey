import { describe, expect, it } from 'vitest';
import { evaluateStructuredCheckpointRunResult } from './executeStoreMissionPipelineRun.js';

describe('evaluateStructuredCheckpointRunResult', () => {
  it('accepts awaiting_input after orchestrator stops at checkpoint', () => {
    expect(
      evaluateStructuredCheckpointRunResult(
        { ok: true, stepsRun: 1, stoppedReason: 'awaiting_checkpoint', status: 'awaiting_input' },
        { status: 'awaiting_input', runState: 'blocked_on_checkpoint' },
      ),
    ).toEqual({ ok: true });
  });

  it('rejects queued mission with no steps run', () => {
    const result = evaluateStructuredCheckpointRunResult(
      { ok: true, stepsRun: 0, stoppedReason: 'no_pending_steps', status: 'queued' },
      { status: 'queued', runState: 'idle' },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('pipeline_not_started');
  });

  it('rejects invalid_state from orchestrator', () => {
    const result = evaluateStructuredCheckpointRunResult(
      { ok: false, stepsRun: 0, stoppedReason: 'invalid_state', status: 'queued' },
      { status: 'queued', runState: 'idle' },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('pipeline_run_failed');
  });

  it('rejects bootstrap-only queued state after run attempt', () => {
    const result = evaluateStructuredCheckpointRunResult(
      { ok: true, stepsRun: 0, stoppedReason: 'no_pending_steps', status: 'queued' },
      { status: 'queued', runState: 'idle' },
    );
    expect(result.ok).toBe(false);
  });
});
