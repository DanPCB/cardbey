import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { id: 'user-test', role: 'platform_admin' };
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
}));

vi.mock('../orchestrator.js', () => ({
  default: {
    executeAgent: vi.fn(async (agent) => ({ agent: agent.id, ok: true })),
    parallel: vi.fn(async (agents) => ({
      successCount: agents.length,
      failureCount: 0,
      results: agents.map((agent) => ({
        agent: agent.id,
        status: 'fulfilled',
        result: { ok: true },
      })),
    })),
    chain: vi.fn(async (agents) => ({
      chainResults: agents.map((agent) => ({ agent: agent.id, result: { ok: true } })),
      finalResult: { ok: true },
    })),
    delegate: vi.fn(async () => ({ ok: true, agent: 'analytics_agent' })),
  },
}));

import agentRegistry from '../agentRegistry.js';
import agentRoutes from '../../../routes/agentRoutes.js';
import orchestrator from '../orchestrator.js';

describe('agentRoutes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    agentRegistry.resetForTests();
    agentRegistry.register({
      id: 'analytics_agent',
      name: 'Analytics Agent',
      capabilities: ['analyze'],
      handler: async () => ({ ok: true }),
    });
    agentRegistry.setStatus('analytics_agent', 'active');
    agentRegistry.updateHealth('analytics_agent', { status: 'healthy' });

    app = express();
    app.use(express.json());
    app.use('/api/agents', agentRoutes);
  });

  it('GET /api/agents/discover finds agents by capability', async () => {
    const res = await request(app).get('/api/agents/discover').query({ capability: 'analyze' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.agents.some((agent) => agent.id === 'analytics_agent')).toBe(true);
  });

  it('POST /api/agents/parallel executes agents in parallel', async () => {
    const res = await request(app)
      .post('/api/agents/parallel')
      .send({
        agents: [{ id: 'analytics_agent' }, { id: 'creative_agent' }],
        context: { storeId: 'store-1' },
      });

    expect(res.status).toBe(200);
    expect(orchestrator.parallel).toHaveBeenCalled();
    expect(res.body.result.successCount).toBe(2);
  });

  it('POST /api/agents/:id/execute runs a single agent', async () => {
    const res = await request(app)
      .post('/api/agents/analytics_agent/execute')
      .send({ context: { storeId: 'store-1' } });

    expect(res.status).toBe(200);
    expect(orchestrator.executeAgent).toHaveBeenCalled();
    expect(res.body.ok).toBe(true);
  });

  it('POST /api/agents/auto-layout reformats messy content', async () => {
    const res = await request(app)
      .post('/api/agents/auto-layout')
      .send({
        content: 'Cardbey Audit\n\nExecutive Summary\nSome findings here.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.processed).toContain('# Cardbey Audit');
    expect(res.body.processed).toContain('## Executive Summary');
    expect(res.body.stats.lines).toBeGreaterThan(0);
  });

  it('POST /api/agents/auto-layout rejects missing content', async () => {
    const res = await request(app).post('/api/agents/auto-layout').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
