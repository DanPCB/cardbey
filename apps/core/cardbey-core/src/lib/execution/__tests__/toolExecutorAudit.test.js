/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../toolExecutors/index.js', () => ({
  listRegisteredExecutorTools: () => [
    'create_store',
    'create_campaign',
    'launch_campaign',
    'activate_campaigns',
    'mutate_poster',
    'analyze_store',
    'apply_patch',
    'structured_store_build',
    'mission_conditional_branch',
  ],
}));

import {
  buildToolAuditEntry,
  buildToolExecutorAuditReport,
  DEDICATED_KERNEL_WRAPPER_TOOLS,
  listGenericKernelRoutedTools,
  resolveToolKernelRoute,
} from '../toolExecutorAudit.js';
import { KERNEL_ONLY_INTAKE_TOOLS } from '../../intake/intakeShortcutPolicy.js';

describe('toolExecutorAudit', () => {
  it('reports all registered executors with kernel routing', () => {
    const report = buildToolExecutorAuditReport();
    expect(report.summary.totalExecutors).toBe(9);
    expect(report.entries.length).toBe(9);
    expect(report.summary.genericKernel).toBeGreaterThan(0);
    expect(report.kernelOnlyTools).toEqual(expect.arrayContaining(['create_store', 'create_campaign']));
  });

  it('classifies dedicated checkpoint tools', () => {
    expect(resolveToolKernelRoute('create_store')).toBe('dedicated_checkpoint');
    expect(resolveToolKernelRoute('create_campaign')).toBe('dedicated_checkpoint');
    expect(resolveToolKernelRoute('launch_campaign')).toBe('dedicated_checkpoint');
    expect(DEDICATED_KERNEL_WRAPPER_TOOLS).toContain('create_store');
  });

  it('classifies generic kernel tools', () => {
    expect(resolveToolKernelRoute('mutate_poster')).toBe('generic_kernel');
    expect(resolveToolKernelRoute('analyze_store')).toBe('generic_kernel');
    expect(listGenericKernelRoutedTools()).toContain('apply_patch');
  });

  it('marks checkpoint-capable intake starters', () => {
    const store = buildToolAuditEntry('create_store');
    expect(store.checkpointCapable).toBe(true);
    expect(store.kernelOnly).toBe(true);
    expect(store.hasKernelWrapper).toBe(true);
    expect(store.emitsUnifiedEvents).toBe(true);
  });

  it('KERNEL_ONLY includes governance-sensitive campaign tools', () => {
    expect(KERNEL_ONLY_INTAKE_TOOLS.has('activate_campaigns')).toBe(true);
    expect(KERNEL_ONLY_INTAKE_TOOLS.has('launch_campaign')).toBe(true);
  });
});
