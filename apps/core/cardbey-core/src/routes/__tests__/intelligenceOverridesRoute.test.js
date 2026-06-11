/**
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const overrideState = { overrides: {} };
const getFleet = vi.fn(async () => overrideState.overrides);
const setFleet = vi.fn(async (body, actorId) => {
  overrideState.overrides = body;
  return body;
});

vi.mock('../../services/intelligence/intelligenceOverrideService.js', () => ({
  getFleetIntelligenceOverrides: (...args) => getFleet(...args),
  setFleetIntelligenceOverrides: (...args) => setFleet(...args),
}));

let adminAllowed = false;
vi.mock('../../middleware/auth.js', () => ({
  optionalAuth: (req, _res, next) => next(),
  requireAuth: (req, _res, next) => {
    req.user = { id: 'admin-user', role: 'admin' };
    next();
  },
  requireAdmin: (req, res, next) => {
    if (!adminAllowed) {
      return res.status(403).json({ ok: false, error: 'Admin access required' });
    }
    next();
  },
}));

import intelligenceRoutes from '../intelligenceRoutes.js';
import { resetFoundationMetrics } from '../../lib/metrics/foundationMetrics.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/intelligence', intelligenceRoutes);
  return app;
}

describe('intelligence overrides routes', () => {
  beforeEach(() => {
    overrideState.overrides = {};
    getFleet.mockClear();
    setFleet.mockClear();
    resetFoundationMetrics();
    adminAllowed = false;
    process.env.NODE_ENV = 'production';
    delete process.env.RENDER_SERVICE_NAME;
    delete process.env.CARDBEY_ENV;
  });

  it('GET /overrides returns persisted state with cache header', async () => {
    overrideState.overrides = { foundation: false };
    const res = await request(makeApp()).get('/api/intelligence/overrides').expect(200);
    expect(res.body.overrides).toEqual({ foundation: false });
    expect(res.headers['cache-control']).toContain('max-age=30');
  });

  it('PUT /overrides rejects non-admin in production', async () => {
    await request(makeApp())
      .put('/api/intelligence/overrides')
      .send({ foundation: false })
      .expect(403);
    expect(setFleet).not.toHaveBeenCalled();
  });

  it('PUT /overrides persists when admin gate passes', async () => {
    adminAllowed = true;
    const res = await request(makeApp())
      .put('/api/intelligence/overrides')
      .send({ surfacePil: false })
      .expect(200);
    expect(res.body.overrides).toEqual({ surfacePil: false });
    expect(setFleet).toHaveBeenCalled();
  });

  it('PUT /overrides returns 400 for force-true payload', async () => {
    adminAllowed = true;
    setFleet.mockImplementationOnce(async () => {
      const err = new Error('force_false_only:foundation');
      err.statusCode = 400;
      err.code = 'invalid_input';
      throw err;
    });
    await request(makeApp())
      .put('/api/intelligence/overrides')
      .send({ foundation: true })
      .expect(400);
  });
});
