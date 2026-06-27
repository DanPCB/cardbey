/**
 * Contract: System Observation admin routes return 39 architecture components.
 */
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/prisma.js', () => ({
  default: {
    ragChunk: { count: vi.fn().mockResolvedValue(3) },
    userFeedback: { count: vi.fn().mockResolvedValue(10) },
    behaviorPattern: { count: vi.fn().mockResolvedValue(2) },
    userProfile: { count: vi.fn().mockResolvedValue(5) },
    missionBlackboard: { count: vi.fn().mockResolvedValue(42) },
    performerSessionContext: { count: vi.fn().mockResolvedValue(7) },
  },
  testDatabaseConnection: vi.fn().mockResolvedValue({ ok: true, dialect: 'sqlite', latencyMs: 2 }),
}));

vi.mock('../../realtime/sse.js', () => ({
  isSseHealthy: vi.fn().mockReturnValue(true),
}));

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (_req, _res, next) => {
    _req.userId = 'admin-user';
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
}));

import systemObservationRoutes, { isSystemObservationEnabled } from '../systemObservationRoutes.js';
import { resetSystemObservationCacheForTests } from '../../lib/systemObservation/componentStatus.js';
import { getComponentRegistry, computeRegistryBaseline } from '../../lib/systemObservation/componentRegistry.js';
import {
  recordFrontendHeartbeat,
  resetFrontendHeartbeatForTests,
} from '../../lib/systemObservation/frontendHeartbeatStore.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/system-observation', systemObservationRoutes);
  return app;
}

describe('System Observation routes', () => {
  beforeEach(() => {
    process.env.ENABLE_SYSTEM_OBSERVATION = 'true';
    resetSystemObservationCacheForTests();
    resetFrontendHeartbeatForTests();
    recordFrontendHeartbeat({
      timestamp: new Date().toISOString(),
      commitSha: 'abc123def',
      surfaces: {
        performer_console: { available: true, route: '/app' },
        control_center: { available: true, route: '/marketing' },
      },
    });
  });

  afterEach(() => {
    delete process.env.ENABLE_SYSTEM_OBSERVATION;
    resetSystemObservationCacheForTests();
    resetFrontendHeartbeatForTests();
  });

  it('is disabled when ENABLE_SYSTEM_OBSERVATION=false', () => {
    process.env.ENABLE_SYSTEM_OBSERVATION = 'false';
    expect(isSystemObservationEnabled()).toBe(false);
  });

  it('GET /status returns registry components, live summary, and doc baseline', async () => {
    const baseline = computeRegistryBaseline(getComponentRegistry());
    const res = await request(makeApp()).get('/api/system-observation/status').expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.components).toHaveLength(baseline.total);
    expect(res.body.summary.total).toBe(baseline.total);
    expect(res.body.summary.running + res.body.summary.degraded + res.body.summary.down).toBe(
      baseline.total,
    );
    expect(res.body.docBaseline).toMatchObject({
      running: baseline.running,
      partial: baseline.partial,
      placeholder: baseline.placeholder,
      total: baseline.total,
      successRatePct: baseline.successRatePct,
    });
    expect(res.body.components[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      layer: expect.any(String),
      status: expect.stringMatching(/running|degraded|down/),
      docStatus: expect.stringMatching(/running|partial|placeholder/),
    });
  });

  it('registry baseline matches architecture catalog', () => {
    const baseline = computeRegistryBaseline(getComponentRegistry());
    expect(getComponentRegistry()).toHaveLength(baseline.total);
    expect(baseline.running + baseline.partial + baseline.placeholder).toBe(baseline.total);
  });

  it('GET /health returns aggregated metrics and doc baseline', async () => {
    const baseline = computeRegistryBaseline(getComponentRegistry());
    const res = await request(makeApp()).get('/api/system-observation/health').expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.summary.total).toBe(baseline.total);
    expect(res.body.metrics).toMatchObject({
      successRate: expect.any(Number),
      totalComponents: baseline.total,
    });
    expect(res.body.docBaseline).toMatchObject({
      running: baseline.running,
      partial: baseline.partial,
      placeholder: baseline.placeholder,
      total: baseline.total,
      successRatePct: baseline.successRatePct,
    });
  });

  it('returns 404 when observation disabled', async () => {
    process.env.ENABLE_SYSTEM_OBSERVATION = 'false';
    const res = await request(makeApp()).get('/api/system-observation/status').expect(404);
    expect(res.body.error).toBe('system_observation_disabled');
  });

  it('database probe reports latency for database component', async () => {
    const res = await request(makeApp()).get('/api/system-observation/status').expect(200);
    const db = res.body.components.find((c) => c.id === 'database');
    expect(db.status).toBe('running');
    expect(db.latency).toBe(2);
  });

  it('null latency for doc-only components', async () => {
    const res = await request(makeApp()).get('/api/system-observation/status').expect(200);
    const performer = res.body.components.find((c) => c.id === 'performer_console');
    expect(performer.latency).toBeNull();
  });

  it('GET /graph returns performer path nodes with live status', async () => {
    const res = await request(makeApp()).get('/api/system-observation/graph').expect(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.nodes)).toBe(true);
    expect(res.body.nodes.length).toBeGreaterThan(10);
    expect(Array.isArray(res.body.edges)).toBe(true);
    expect(res.body.path).toBe('performer');
    expect(res.body.viewBox).toMatchObject({ width: 960, height: 480 });
    const intake = res.body.nodes.find((n) => n.id === 'intake_v2');
    expect(intake).toMatchObject({
      id: 'intake_v2',
      status: expect.stringMatching(/running|degraded|down/),
      x: expect.any(Number),
      y: expect.any(Number),
    });
  });

  it('POST /frontend-heartbeat stores dashboard surfaces', async () => {
    const res = await request(makeApp())
      .post('/api/system-observation/frontend-heartbeat')
      .send({
        commitSha: 'deadbeef',
        surfaces: { control_center: { available: true, route: '/marketing' } },
      })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.receivedAt).toBe('string');

    resetSystemObservationCacheForTests();
    const status = await request(makeApp()).get('/api/system-observation/status').expect(200);
    const cc = status.body.components.find((c) => c.id === 'control_center');
    expect(cc.message).toMatch(/Heartbeat OK/i);
  });

  it('learning and rag probes return live metrics or flag baseline', async () => {
    const res = await request(makeApp()).get('/api/system-observation/status').expect(200);
    const learning = res.body.components.find((c) => c.id === 'feedback_capture');
    const ragStore = res.body.components.find((c) => c.id === 'rag_store');
    expect(learning.latency).toEqual(expect.any(Number));
    expect(learning.message).toMatch(/feedback rows/i);
    expect(ragStore.docStatus).toBe('partial');
    expect(ragStore.status).toBe('degraded');
    expect(ragStore.message).toMatch(/Flag-gated off by default|chunk/i);
  });

  it('flag-gated components report partial doc baseline with degraded live status', async () => {
    const res = await request(makeApp()).get('/api/system-observation/status').expect(200);
    const llm = res.body.components.find((c) => c.id === 'llm_reasoner');
    expect(llm.docStatus).toBe('partial');
    expect(llm.status).toBe('degraded');
    expect(llm.message).toMatch(/Flag-gated off by default/i);
  });
});
