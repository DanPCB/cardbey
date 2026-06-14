import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../services/memory/memoryFacade.js', () => ({
  default: {
    getBundle: vi.fn(),
    invalidate: vi.fn(),
  },
  normalizeMemoryContext: vi.fn((ctx) => ctx),
}));

vi.mock('../../middleware/auth.js', () => ({
  optionalAuth: (_req, _res, next) => next(),
  requireAuth: (req, _res, next) => {
    req.user = { id: 'user-test', role: 'store_owner', email: 'test@example.com' };
    next();
  },
}));

vi.mock('../../middleware/guestSession.js', () => ({
  guestSessionId: (_req, _res, next) => next(),
}));

vi.mock('../../lib/metrics/foundationMetrics.js', () => ({
  recordRouteLatency: vi.fn(),
}));

import memoryFacade from '../../services/memory/memoryFacade.js';
import memoryRoutes from '../memoryRoutes.js';

describe('memoryRoutes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/memory', memoryRoutes);
  });

  it('POST /api/memory/bundle returns unified bundle', async () => {
    memoryFacade.getBundle.mockResolvedValue({
      ok: true,
      business: null,
      suitcase: [],
      user: null,
      session: { learnedSignals: [], recentTypes: [], sessionId: null },
      mission: null,
      meta: { fetchedAt: new Date().toISOString(), sources: [], partial: false, fetchDurationMs: 12 },
    });

    const res = await request(app)
      .post('/api/memory/bundle')
      .send({
        context: {
          actor: { type: 'store_owner' },
          storeId: 'store-1',
          sessionId: 'sess-1',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.bundle).toHaveProperty('meta');
    expect(memoryFacade.getBundle).toHaveBeenCalledOnce();
  });

  it('POST /api/memory/invalidate succeeds for authenticated user', async () => {
    const res = await request(app)
      .post('/api/memory/invalidate')
      .send({ context: { storeId: 'store-1' } });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(memoryFacade.invalidate).toHaveBeenCalledOnce();
  });
});
