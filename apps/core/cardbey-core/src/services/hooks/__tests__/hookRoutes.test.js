import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { id: 'admin-1', role: 'platform_admin' };
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
}));

import hookRegistry from '../hookRegistry.js';
import hookRoutes from '../../../routes/hookRoutes.js';
import { HOOK_TYPES } from '../hookRegistry.js';

describe('hookRoutes', () => {
  let app;

  beforeEach(() => {
    hookRegistry.clear();
    hookRegistry.register({
      id: 'test_pre',
      type: HOOK_TYPES.PRE_EXECUTION,
      name: 'Test Pre',
      handler: async () => ({ ok: true }),
    });

    app = express();
    app.use(express.json());
    app.use('/api/hooks', hookRoutes);
  });

  it('GET /api/hooks lists registered hooks', async () => {
    const res = await request(app).get('/api/hooks');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.hooks.some((h) => h.id === 'test_pre')).toBe(true);
  });

  it('POST /api/hooks/test runs pre hooks', async () => {
    const res = await request(app)
      .post('/api/hooks/test')
      .send({ skillId: 'analyze_store', context: { userId: 'u1', storeId: 's1' } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.results.results.length).toBeGreaterThan(0);
  });
});
