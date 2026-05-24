import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { actionIdForTool, recordExecutionTelemetry } from './executionTelemetry.js';

vi.mock('../telemetry/healthProbes.js', () => ({
  emitHealthProbe: vi.fn(),
}));

import { emitHealthProbe } from '../telemetry/healthProbes.js';

describe('executionTelemetry', () => {
  const prev = process.env.BROKER_EXECUTION_TELEMETRY;

  beforeEach(() => {
    process.env.BROKER_EXECUTION_TELEMETRY = 'true';
    vi.mocked(emitHealthProbe).mockClear();
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.BROKER_EXECUTION_TELEMETRY;
    else process.env.BROKER_EXECUTION_TELEMETRY = prev;
  });

  it('actionIdForTool prefixes tool names', () => {
    expect(actionIdForTool('create_store')).toBe('tool:create_store');
  });

  it('recordExecutionTelemetry emits broker.execution probe', () => {
    recordExecutionTelemetry({
      actionId: actionIdForTool('edit_artifact'),
      source: 'test',
      status: 'completed',
      toolName: 'edit_artifact',
      durationMs: 12,
    });
    expect(emitHealthProbe).toHaveBeenCalledWith(
      'broker.execution',
      expect.objectContaining({
        actionId: 'tool:edit_artifact',
        toolName: 'edit_artifact',
        source: 'test',
        status: 'completed',
      }),
    );
  });
});
