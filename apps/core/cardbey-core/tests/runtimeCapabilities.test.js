/**
 * Runtime capabilities — unit tests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  getRuntimeCapabilities,
  initRuntimeCapabilities,
  resetRuntimeCapabilitiesForTests,
  getRuntimeCapabilityEventsForTests,
  requireRuntimeCapability,
  userMessageForCapability,
} from '../src/lib/runtime/runtimeCapabilitiesService.js';
import runtimeCapabilitiesRoutes from '../src/routes/runtimeCapabilitiesRoutes.js';

describe('runtimeCapabilitiesService', () => {
  beforeEach(() => {
    resetRuntimeCapabilitiesForTests();
    delete process.env.EXECUTION_MODE;
    delete process.env.DISABLE_RUNTIME_STEP_EXECUTION;
    delete process.env.DISABLE_RUNTIME_KERNEL;
    delete process.env.DISABLE_SHARED_RUNTIME_TOOL_REGISTRY;
  });

  afterEach(() => {
    resetRuntimeCapabilitiesForTests();
  });

  it('kernel capabilities default to enabled when env unset', () => {
    delete process.env.ENABLE_RUNTIME_STEP_EXECUTION;
    delete process.env.DISABLE_RUNTIME_STEP_EXECUTION;
    delete process.env.DISABLE_RUNTIME_KERNEL;
    resetRuntimeCapabilitiesForTests();
    const caps = initRuntimeCapabilities();
    expect(caps.runtimeStepExecution).toBe(true);
    expect(caps.runtimeKernel).toBe(true);
    expect(caps.sharedRuntimeToolRegistry).toBe(true);
  });

  it('DISABLE_RUNTIME_STEP_EXECUTION turns off step execution', () => {
    process.env.DISABLE_RUNTIME_STEP_EXECUTION = 'true';
    resetRuntimeCapabilitiesForTests();
    const caps = initRuntimeCapabilities();
    expect(caps.runtimeStepExecution).toBe(false);
  });

  it('computes capabilities once at boot when explicitly enabled', () => {
    process.env.ENABLE_RUNTIME_STEP_EXECUTION = 'true';
    const a = initRuntimeCapabilities();
    const b = getRuntimeCapabilities();
    expect(a).toBe(b);
    expect(b.runtimeStepExecution).toBe(true);
  });

  it('legacy missing-env warning only when capability default is false', () => {
    delete process.env.ENABLE_RUNTIME_MISSION_ORCHESTRATOR;
    resetRuntimeCapabilitiesForTests();
    initRuntimeCapabilities();
    const events = getRuntimeCapabilityEventsForTests();
    expect(events.some((e) => e.type === 'runtime.capability.missing' && e.capability === 'runtimeMissionOrchestrator')).toBe(
      true,
    );
  });

  it('requireRuntimeCapability returns user-safe message without env names', () => {
    process.env.DISABLE_RUNTIME_STEP_EXECUTION = 'true';
    resetRuntimeCapabilitiesForTests();
    initRuntimeCapabilities();
    const gate = requireRuntimeCapability('runtimeStepExecution', { source: 'test' });
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.message).not.toMatch(/ENABLE_/);
      expect(gate.message).toContain('not available');
    }
    expect(userMessageForCapability('runtimeStepExecution')).not.toMatch(/ENABLE_/);
  });

  it('GET /api/runtime/capabilities returns normalized payload', async () => {
    process.env.ENABLE_RUNTIME_STEP_EXECUTION = 'true';
    resetRuntimeCapabilitiesForTests();
    const app = express();
    app.use('/api/runtime/capabilities', runtimeCapabilitiesRoutes);
    const res = await request(app).get('/api/runtime/capabilities/');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.runtimeStepExecution).toBe('boolean');
    expect(res.body.runtimeStepExecution).toBe(true);
  });

  it('existing runtime execution capability works when enabled', () => {
    process.env.ENABLE_PERFORMER_RUNTIME_KERNEL = 'true';
    process.env.ENABLE_RUNTIME_STEP_EXECUTION = 'true';
    process.env.ENABLE_SHARED_RUNTIME_TOOL_REGISTRY = 'true';
    const caps = initRuntimeCapabilities();
    expect(caps.runtimeKernel).toBe(true);
    expect(caps.runtimeStepExecution).toBe(true);
    expect(caps.sharedRuntimeToolRegistry).toBe(true);
  });
});
