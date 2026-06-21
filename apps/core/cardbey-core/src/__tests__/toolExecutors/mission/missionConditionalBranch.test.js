/**
 * mission_conditional_branch executor tests.
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { execute as missionConditionalBranch } from '../../../lib/toolExecutors/mission/mission_conditional_branch.js';
import { EXECUTION_STATES } from '../../../lib/telemetry/executionStates.js';

describe('mission_conditional_branch', () => {
  it('records branch metadata with executed state', async () => {
    const result = await missionConditionalBranch(
      { branch: 'upload', label: 'await_logo_upload' },
      { missionId: 'mission-1' },
    );

    expect(result.status).toBe('ok');
    expect(result.output?.branch).toBe('upload');
    expect(result.output?.label).toBe('await_logo_upload');
    expect(result.output?.executionState).toBe(EXECUTION_STATES.EXECUTED);
    expect(result.output?.stubbed).toBeUndefined();
  });

  it('legacy mission_pipeline_stub alias behaves the same', async () => {
    const { getExecutor } = await import('../../../lib/toolExecutors/index.js');
    const stub = getExecutor('mission_pipeline_stub');
    expect(stub?.execute).toBeDefined();

    const result = await stub.execute(
      { branch: 'default', label: 'assign_default_logo' },
      { missionId: 'mission-2' },
    );

    expect(result.status).toBe('ok');
    expect(result.output?.executionState).toBe(EXECUTION_STATES.EXECUTED);
  });
});
