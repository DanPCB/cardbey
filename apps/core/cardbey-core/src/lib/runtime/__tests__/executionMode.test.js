/**
 * Phase 9 — EXECUTION_MODE consolidation.
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getExecutionMode,
  getExecutionModeProfile,
  resetExecutionModeForTests,
  isKernelMandatoryEnabled,
  isBrokerBlockDirectActionEnabled,
  isPerformerRuntimeEnabled,
  isPerformerRuntimePipelineFacadeEnabled,
} from '../executionMode.js';

describe('executionMode', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    resetExecutionModeForTests();
    delete process.env.EXECUTION_MODE;
    delete process.env.EMERGENCY_BYPASS_KERNEL;
    delete process.env.DISABLE_KERNEL_MANDATORY;
    delete process.env.BROKER_BLOCK_DIRECT_ACTION;
    delete process.env.BROKER_DIRECT_VIA_FACADE;
    delete process.env.PERFORMER_RUNTIME_ENABLED;
    delete process.env.PERFORMER_RUNTIME_PIPELINE_FACADE;
    delete process.env.DISABLE_RUNTIME_KERNEL;
    delete process.env.DISABLE_RUNTIME_STEP_EXECUTION;
    delete process.env.DISABLE_SHARED_RUNTIME_TOOL_REGISTRY;
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
    resetExecutionModeForTests();
  });

  it('defaults to kernel authority when env unset', () => {
    expect(getExecutionMode()).toBe('kernel');
    const profile = getExecutionModeProfile();
    expect(profile.source).toBe('legacy_env_compat');
    expect(profile.kernelMandatory).toBe(true);
    expect(profile.brokerBlockDirectAction).toBe(true);
    expect(isKernelMandatoryEnabled()).toBe(true);
  });

  it('EXECUTION_MODE=kernel enables full enforcement preset', () => {
    process.env.EXECUTION_MODE = 'kernel';
    const profile = getExecutionModeProfile();
    expect(profile.mode).toBe('kernel');
    expect(profile.source).toBe('EXECUTION_MODE');
    expect(profile.kernelMandatory).toBe(true);
    expect(profile.runtimeKernel).toBe(true);
    expect(profile.brokerBlockDirectAction).toBe(true);
    expect(profile.performerRuntimeEnabled).toBe(true);
    expect(profile.performerRuntimePipelineFacade).toBe(true);
  });

  it('EXECUTION_MODE=hybrid relaxes broker direct block only', () => {
    process.env.EXECUTION_MODE = 'hybrid';
    const profile = getExecutionModeProfile();
    expect(profile.mode).toBe('hybrid');
    expect(profile.kernelMandatory).toBe(true);
    expect(profile.brokerBlockDirectAction).toBe(false);
    expect(profile.runtimeKernel).toBe(true);
  });

  it('EXECUTION_MODE=legacy disables kernel enforcement and logs deprecation', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.EXECUTION_MODE = 'legacy';
    const profile = getExecutionModeProfile();
    expect(profile.mode).toBe('legacy');
    expect(profile.kernelMandatory).toBe(false);
    expect(profile.runtimeKernel).toBe(false);
    expect(profile.brokerBlockDirectAction).toBe(false);
    expect(isKernelMandatoryEnabled()).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      '[execution-mode] legacy mode active; direct bypass paths may be used',
      expect.objectContaining({ mode: 'legacy' }),
    );
    warn.mockRestore();
  });

  it('maps DISABLE_KERNEL_MANDATORY to legacy compat profile', () => {
    process.env.DISABLE_KERNEL_MANDATORY = 'true';
    expect(getExecutionMode()).toBe('legacy');
    expect(isKernelMandatoryEnabled()).toBe(false);
  });

  it('maps BROKER_BLOCK_DIRECT_ACTION=false to hybrid compat profile', () => {
    process.env.BROKER_BLOCK_DIRECT_ACTION = 'false';
    expect(getExecutionMode()).toBe('hybrid');
    expect(isBrokerBlockDirectActionEnabled()).toBe(false);
    expect(isKernelMandatoryEnabled()).toBe(true);
  });

  it('ignores deprecated flags when EXECUTION_MODE is explicit', () => {
    process.env.EXECUTION_MODE = 'kernel';
    process.env.BROKER_BLOCK_DIRECT_ACTION = 'false';
    process.env.PERFORMER_RUNTIME_ENABLED = 'false';
    expect(isBrokerBlockDirectActionEnabled()).toBe(true);
    expect(isPerformerRuntimeEnabled()).toBe(true);
  });

  it('legacy rollout flags still drive performer runtime when EXECUTION_MODE unset', () => {
    process.env.BROKER_BLOCK_DIRECT_ACTION = 'false';
    process.env.BROKER_DIRECT_VIA_FACADE = 'true';
    process.env.PERFORMER_RUNTIME_ENABLED = 'true';
    expect(getExecutionMode()).toBe('hybrid');
    expect(isPerformerRuntimeEnabled()).toBe(true);
    expect(isPerformerRuntimePipelineFacadeEnabled()).toBe(true);
  });
});
