/**
 * POST /api/missions/:missionId/run — correlation header + body.cardbeyTraceId wiring.
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeRunMock = vi.fn();

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (_req, _res, next) => next(),
  optionalAuth: (_req, _res, next) => next(),
}));

vi.mock('../../lib/storeMission/executeStoreMissionPipelineRun.js', () => ({
  executeStoreMissionPipelineRun: (...args) => executeRunMock(...args),
}));

import missionsRoutes from '../missionsRoutes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'user-mission-test' };
    next();
  });
  app.use('/api/missions', missionsRoutes);
  return app;
}

describe('POST /api/missions/:missionId/run', () => {
  beforeEach(() => {
    executeRunMock.mockReset();
    executeRunMock.mockResolvedValue({
      ok: true,
      missionId: 'm-test-1',
      jobId: 'job-1',
      generationRunId: 'run-1',
      draftId: 'draft-1',
      status: 'executing',
    });
  });

  it('sets x-cardbey-trace-id and passes cardbeyTraceId in body to executeStoreMissionPipelineRun', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/missions/m-test-1/run')
      .set('X-Cardbey-Trace-Id', 'missions-run-trace-xyz')
      .send({ businessName: 'Cafe', businessType: 'cafe' });

    expect(res.status).toBe(200);
    expect(res.headers['x-cardbey-trace-id']).toBe('missions-run-trace-xyz');
    expect(executeRunMock).toHaveBeenCalledTimes(1);
    const call = executeRunMock.mock.calls[0][0];
    expect(call.body.cardbeyTraceId).toBe('missions-run-trace-xyz');
    expect(call.missionId).toBe('m-test-1');
  });

  it('echoes generated trace when client omits header', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/missions/m-test-2/run').send({ businessName: 'X' });
    expect(res.status).toBe(200);
    expect(res.headers['x-cardbey-trace-id']).toMatch(/^[a-f0-9-]{36}$/i);
    expect(executeRunMock.mock.calls[0][0].body.cardbeyTraceId).toBe(res.headers['x-cardbey-trace-id']);
  });
});
