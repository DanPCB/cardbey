import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getRuntimeAuthorityRolloutStage,
  getRuntimeAuthoritySnapshot,
  detectExecutionDuplication,
  recordRuntimeBypass,
  resetRuntimeAuthorityMetrics,
  resetExecutionDuplicationState,
  incrementRuntimeAuthorityMetric,
} from './runtimeAuthorityStaging.js';
import { resetExecutionModeForTests } from '../executionMode.js';

describe('runtimeAuthorityStaging', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    resetRuntimeAuthorityMetrics();
    resetExecutionDuplicationState();
    resetExecutionModeForTests();
    delete process.env.EXECUTION_MODE;
    delete process.env.BROKER_DIRECT_VIA_FACADE;
    delete process.env.PERFORMER_RUNTIME_ENABLED;
    delete process.env.PERFORMER_RUNTIME_PIPELINE_FACADE;
    delete process.env.BROKER_BLOCK_DIRECT_ACTION;
    delete process.env.PERFORMER_RUNTIME_OWNERSHIP_BLOCK;
    process.env.EXECUTION_MODE = 'legacy';
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('reports BASE stage when no rollout flags set', () => {
    expect(getRuntimeAuthorityRolloutStage()).toBe('BASE');
  });

  it('advances rollout stage with env flags when EXECUTION_MODE unset', () => {
    delete process.env.EXECUTION_MODE;
    resetExecutionModeForTests();
    process.env.BROKER_BLOCK_DIRECT_ACTION = 'false';
    process.env.PERFORMER_RUNTIME_PIPELINE_FACADE = 'false';
    process.env.BROKER_DIRECT_VIA_FACADE = 'true';
    expect(getRuntimeAuthorityRolloutStage()).toBe('A');
    process.env.PERFORMER_RUNTIME_ENABLED = 'true';
    resetExecutionModeForTests();
    expect(getRuntimeAuthorityRolloutStage()).toBe('B');
    process.env.PERFORMER_RUNTIME_PIPELINE_FACADE = 'true';
    resetExecutionModeForTests();
    expect(getRuntimeAuthorityRolloutStage()).toBe('C');
  });

  it('detects duplicate execution within window', () => {
    const first = detectExecutionDuplication({
      missionId: 'm-1',
      toolName: 'analyze_store',
      source: 'test',
    });
    expect(first.duplicate).toBe(false);
    const second = detectExecutionDuplication({
      missionId: 'm-1',
      toolName: 'analyze_store',
      source: 'test',
    });
    expect(second.duplicate).toBe(true);
    expect(second.priorCount).toBeGreaterThan(1);
  });

  it('snapshot includes flags and metrics', () => {
    recordRuntimeBypass('direct_dispatch', { tool: 'x' });
    incrementRuntimeAuthorityMetric('orphanWarnings');
    const snap = getRuntimeAuthoritySnapshot();
    expect(snap.ok).toBe(true);
    expect(snap.executionMode).toBe('legacy');
    expect(snap.flags.broker).toBeDefined();
    expect(snap.metrics.bypassDirectDispatch).toBe(1);
    expect(snap.recommendations.nextStep).toBeTruthy();
  });
});
