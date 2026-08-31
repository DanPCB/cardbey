/**
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestResponseStateMiddleware, safeJson } from '../../middleware/requestResponseState.js';
import { latencyGuard } from '../../middleware/latencyGuard.js';

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => {
    req.userId = 'admin-user';
    req.user = { id: 'admin-user', role: 'super_admin' };
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
}));

vi.mock('../../services/reliability/rateLimitMiddleware.js', () => ({
  rateLimitMiddleware: () => (_req, _res, next) => next(),
}));

const analyzeMock = vi.fn();

vi.mock('../../lib/marketIntent/admin/marketIntentAdminService.js', () => ({
  analyzeMarketIntentForAdmin: (...args) => analyzeMock(...args),
  MarketIntentAdminError: class MarketIntentAdminError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
      this.name = 'MarketIntentAdminError';
    }
  },
}));

vi.mock('../../lib/marketIntent/admin/marketIntentAdminConfig.js', () => ({
  isMarketIntentAdminTestUiEnabled: () => true,
  MARKET_INTENT_ADMIN_MAX_RAW_TEXT: 12000,
}));

import marketIntentAdminRoutes from '../admin/marketIntentAdminRoutes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(requestResponseStateMiddleware);
  app.use(latencyGuard);
  app.use('/api/admin/market-intent', marketIntentAdminRoutes);
  return app;
}

const validBody = {
  rawText: 'Manufacturer seeking Australian distributors for sustainable packaging.',
  sourceType: 'social_post',
  permitted: true,
};

describe('marketIntentAdminRoutes', () => {
  beforeEach(() => {
    analyzeMock.mockReset();
    process.env.ENABLE_MARKET_INTENT_ADMIN_TEST_UI_V1 = 'true';
  });

  it('returns analysis result on success', async () => {
    analyzeMock.mockResolvedValueOnce({
      ok: true,
      status: 'READY',
      stageStatus: { g1: 'ok', g2: 'ok', g3: 'ok', g4: 'ok' },
      timingsMs: { g1: 10, g2: 20, g3: 5, g4: 8, total: 43 },
    });

    const res = await request(makeApp())
      .post('/api/admin/market-intent/analyze')
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('READY');
    expect(res.body.timingsMs.total).toBe(43);
  });

  it('does not send a second response when handler completes after timeout', async () => {
    process.env.API_REQUEST_TIMEOUT_MS = '40';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const timeoutApp = express();
    timeoutApp.use(express.json());
    timeoutApp.use(requestResponseStateMiddleware);
    timeoutApp.use(latencyGuard);
    timeoutApp.post('/api/test/slow-handler', async (req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (req.isRequestAborted?.()) return;
      safeJson(res, 200, { ok: true }, req);
    });

    const res = await request(timeoutApp).post('/api/test/slow-handler').send({});

    expect(res.status).toBe(408);
    expect(res.body.error).toBe('request_timeout');
    await new Promise((r) => setTimeout(r, 150));

    warnSpy.mockRestore();
    delete process.env.API_REQUEST_TIMEOUT_MS;
  });

  it('uses long-running timeout class for market-intent analyze', async () => {
    analyzeMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                ok: true,
                status: 'READY',
                stageStatus: { g1: 'ok', g2: 'ok', g3: 'ok', g4: 'ok' },
              }),
            80,
          );
        }),
    );

    process.env.API_REQUEST_TIMEOUT_MS = '30';
    process.env.API_LONG_RUNNING_TIMEOUT_MS = '5000';

    const res = await request(makeApp())
      .post('/api/admin/market-intent/analyze')
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('READY');

    delete process.env.API_REQUEST_TIMEOUT_MS;
    delete process.env.API_LONG_RUNNING_TIMEOUT_MS;
  });
});
