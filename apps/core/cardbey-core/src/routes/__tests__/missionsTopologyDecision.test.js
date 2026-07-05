/**
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleTopologyDecisionMock = vi.fn(async () => ({
  ok: true,
  status: 'executing',
  executionMode: 'campaign',
  missionId: 'mission-topology-1',
  execution: { status: 'executing', executionMode: 'campaign', nodeCount: 4 },
}));

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (_req, _res, next) => {
    _req.user = { id: 'user_test_1' };
    next();
  },
  optionalAuth: (_req, _res, next) => next(),
}));

vi.mock('../../lib/missionAccess.js', () => ({
  resolveAccessibleMission: vi.fn(async () => ({ ok: true })),
  getTenantId: vi.fn(() => 'tenant_test_1'),
}));

vi.mock('../../lib/mission/topologyReviewService.js', () => ({
  handleTopologyDecision: (...args) => handleTopologyDecisionMock(...args),
}));

describe('POST /api/missions/:missionId/topology-decision', () => {
  beforeEach(() => {
    handleTopologyDecisionMock.mockClear();
  });

  it('approves pending topology and returns executing status', async () => {
    const { default: missionsRoutes } = await import('../missionsRoutes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/missions', missionsRoutes);

    const res = await request(app)
      .post('/api/missions/mission-topology-1/topology-decision')
      .send({ decision: 'approve' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe('executing');
    expect(res.body.executionMode).toBe('campaign');
    expect(handleTopologyDecisionMock).toHaveBeenCalledWith(
      'mission-topology-1',
      expect.objectContaining({ decision: 'approve', userId: 'user_test_1' }),
    );
  });

  it('rejects invalid decision', async () => {
    const { default: missionsRoutes } = await import('../missionsRoutes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/missions', missionsRoutes);

    const res = await request(app)
      .post('/api/missions/mission-topology-1/topology-decision')
      .send({ decision: 'maybe' });

    expect(res.status).toBe(400);
    expect(handleTopologyDecisionMock).not.toHaveBeenCalled();
  });
});
