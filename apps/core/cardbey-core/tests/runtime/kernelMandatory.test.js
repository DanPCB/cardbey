/**
 * Runtime Kernel mandatory enforcement tests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  assertKernelAuthorizedExecution,
  normalizeClassificationForKernel,
  isRuntimeStepExecutionEnabled,
  isKernelMandatoryEnabled,
} from '../../src/lib/runtime/kernelMandatory.js';
import { resetKernelAuditForTests } from '../../src/lib/runtime/kernelAudit.js';
import { guardBrokerDirectAction } from '../../src/lib/broker/brokerRunwayGuard.js';
import { executeRuntimeAction } from '../../src/lib/runtime/performerRuntime/executeRuntimeAction.js';
import { resetRuntimeCapabilitiesForTests } from '../../src/lib/runtime/runtimeCapabilitiesService.js';

describe('Runtime Kernel Mandatory', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    resetRuntimeCapabilitiesForTests();
    resetKernelAuditForTests();
    delete process.env.EMERGENCY_BYPASS_KERNEL;
    delete process.env.DISABLE_KERNEL_MANDATORY;
    delete process.env.DISABLE_RUNTIME_STEP_EXECUTION;
    delete process.env.DISABLE_RUNTIME_KERNEL;
    delete process.env.DISABLE_SHARED_RUNTIME_TOOL_REGISTRY;
    delete process.env.BROKER_BLOCK_DIRECT_ACTION;
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
    resetRuntimeCapabilitiesForTests();
    resetKernelAuditForTests();
  });

  it('enables runtime step execution by default', () => {
    expect(isRuntimeStepExecutionEnabled()).toBe(true);
  });

  it('blocks unauthorized runtime execution sources', () => {
    const result = assertKernelAuthorizedExecution({ source: 'intake_v2' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('KERNEL_EXECUTION_REQUIRED');
    }
  });

  it('allows kernel-authorized sources', () => {
    expect(assertKernelAuthorizedExecution({ source: 'performer_proactive_step' }).ok).toBe(true);
    expect(assertKernelAuthorizedExecution({ source: 'factory_runtime_api' }).ok).toBe(true);
  });

  it('normalizes direct_action to proactive_plan under kernel mandatory', () => {
    const normalized = normalizeClassificationForKernel({
      executionPath: 'direct_action',
      tool: 'analyze_store',
      confidence: 0.9,
      parameters: {},
    });
    expect(normalized.executionPath).toBe('proactive_plan');
    expect(normalized._kernelNormalizedFrom).toBe('direct_action');
  });

  it('blocks direct tool dispatch via broker guard by default', () => {
    const guard = guardBrokerDirectAction({ source: 'intake_v2' });
    expect(guard.blocked).toBe(true);
  });

  it('blocks executeRuntimeAction from intake_v2 source', async () => {
    const result = await executeRuntimeAction({
      actionType: 'dispatch_tool',
      source: 'intake_v2',
      payload: { toolName: 'analyze_store' },
    });
    expect(result.status).toBe('blocked');
    expect(result.blocker?.code).toBe('KERNEL_EXECUTION_REQUIRED');
  });

  it('allows ui runtime execute_action regardless of caller source label', () => {
    expect(
      assertKernelAuthorizedExecution({
        source: 'publish_modal',
        actionType: 'execute_action',
      }).ok,
    ).toBe(true);
  });

  it('allows hybrid assist operations through runtime kernel', () => {
    expect(
      assertKernelAuthorizedExecution({
        source: 'intent_hybrid_router',
        actionType: 'assist_hybrid_operation',
      }).ok,
    ).toBe(true);
  });

  it('allows emergency bypass when enabled', () => {
    process.env.EMERGENCY_BYPASS_KERNEL = 'true';
    expect(isKernelMandatoryEnabled()).toBe(false);
    expect(guardBrokerDirectAction({ source: 'intake_v2' }).blocked).toBe(false);
  });

  it('allows ui runtime execute_action without broker block', async () => {
    const result = await executeRuntimeAction({
      actionType: 'execute_action',
      actionId: 'ui:update_hero_artifact',
      source: 'ui_hero_patch',
      userId: 'user-test',
      payload: { action: 'update_hero_artifact' },
    });
    expect(result.status).not.toBe('blocked');
    expect(result.blocker?.code).not.toBe('BROKER_DIRECT_ACTION_BLOCKED');
  });
});
