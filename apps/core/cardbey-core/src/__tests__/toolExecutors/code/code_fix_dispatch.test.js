import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execute as codeFix } from '../../../lib/toolExecutors/code/code_fix.js';
import { EXECUTION_STATES } from '../../../lib/telemetry/executionStates.js';

vi.mock('../../../services/codeFixPerformerService.js', () => ({
  runCodeFixAnalysis: vi.fn(async ({ description }) => ({
    ok: true,
    output: {
      phase: 'awaiting_approval',
      tool: 'code_fix',
      description,
    },
  })),
  tryBuildStoreContentFixOutputFromIntakePatch: vi.fn(() => null),
}));

describe('code_fix governed executor', () => {
  it('returns governance trace and execution state', async () => {
    const result = await codeFix(
      { description: 'Fix headline to MIMI WEB' },
      { userId: 'u1', storeId: 's1', source: 'intake_v2_unified' },
    );

    expect(result.status).toBe('ok');
    expect(result.output?.executionState).toBe(EXECUTION_STATES.EXECUTED);
    expect(result.output?.governanceTrace?.bypass).toBe(true);
    expect(result.output?.phase).toBe('awaiting_approval');
  });

  it('blocks without description', async () => {
    const result = await codeFix({}, { userId: 'u1' });
    expect(result.status).toBe('blocked');
    expect(result.blocker?.code).toBe('DESCRIPTION_REQUIRED');
  });
});

describe('code_fix dispatcher bypass removed', () => {
  it('toolDispatcher no longer short-circuits code_fix as proactive-only', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, '../../../lib/toolDispatcher.js'), 'utf8');
    expect(src).not.toMatch(/PROACTIVE_ONLY_TOOLS/);
    expect(src).not.toMatch(/proactiveOnly:\s*true/);
  });
});
