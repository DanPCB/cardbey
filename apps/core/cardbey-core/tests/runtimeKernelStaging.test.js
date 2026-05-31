/**
 * Runtime Kernel staging rollout detection.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getRuntimeKernelRolloutStage,
  getRuntimeKernelStagingSnapshot,
} from '../src/lib/runtime/runtimeKernelStaging.js';
import { resetRuntimeCapabilitiesForTests } from '../src/lib/runtime/runtimeCapabilitiesService.js';

describe('runtimeKernelStaging', () => {
  beforeEach(() => {
    resetRuntimeCapabilitiesForTests();
  });

  afterEach(() => {
    resetRuntimeCapabilitiesForTests();
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('ENABLE_RUNTIME_') || k === 'ENABLE_PERFORMER_RUNTIME_KERNEL') {
        delete process.env[k];
      }
    }
  });

  it('returns OFF when foundation missing', () => {
    process.env.ENABLE_PERFORMER_RUNTIME_KERNEL = 'false';
    process.env.ENABLE_RUNTIME_STEP_EXECUTION = 'false';
    process.env.ENABLE_SHARED_RUNTIME_TOOL_REGISTRY = 'false';
    process.env.ENABLE_RUNTIME_MISSION_ORCHESTRATOR = 'false';
    resetRuntimeCapabilitiesForTests();
    expect(getRuntimeKernelRolloutStage()).toBe('OFF');
  });

  it('returns FOUNDATION when only kernel flags on', () => {
    process.env.ENABLE_PERFORMER_RUNTIME_KERNEL = 'true';
    process.env.ENABLE_RUNTIME_STEP_EXECUTION = 'true';
    process.env.ENABLE_SHARED_RUNTIME_TOOL_REGISTRY = 'true';
    resetRuntimeCapabilitiesForTests();
    expect(getRuntimeKernelRolloutStage()).toBe('FOUNDATION');
  });

  it('returns PHASE_B when orchestrator enabled', () => {
    process.env.ENABLE_PERFORMER_RUNTIME_KERNEL = 'true';
    process.env.ENABLE_RUNTIME_STEP_EXECUTION = 'true';
    process.env.ENABLE_SHARED_RUNTIME_TOOL_REGISTRY = 'true';
    process.env.ENABLE_RUNTIME_MISSION_ORCHESTRATOR = 'true';
    resetRuntimeCapabilitiesForTests();
    expect(getRuntimeKernelRolloutStage()).toBe('PHASE_B');
  });

  it('snapshot includes recommendations', () => {
    process.env.ENABLE_PERFORMER_RUNTIME_KERNEL = 'true';
    process.env.ENABLE_RUNTIME_STEP_EXECUTION = 'true';
    process.env.ENABLE_SHARED_RUNTIME_TOOL_REGISTRY = 'true';
    resetRuntimeCapabilitiesForTests();
    const snap = getRuntimeKernelStagingSnapshot();
    expect(snap.rolloutStage).toBe('FOUNDATION');
    expect(snap.recommendations.nextStage).toBe('PHASE_B');
    expect(snap.recommendations.enableEnv).toContain('ENABLE_RUNTIME_MISSION_ORCHESTRATOR');
  });
});
