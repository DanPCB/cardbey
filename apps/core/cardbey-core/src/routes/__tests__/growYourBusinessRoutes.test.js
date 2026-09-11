/**
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestResponseStateMiddleware } from '../../middleware/requestResponseState.js';
import { latencyGuard } from '../../middleware/latencyGuard.js';

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => {
    if (req.headers['x-unauth'] === '1') {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    req.userId = 'user-1';
    req.user = { id: 'user-1', role: 'user' };
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
}));

vi.mock('../../services/reliability/rateLimitMiddleware.js', () => ({
  rateLimitMiddleware: () => (_req, _res, next) => next(),
}));

const analyzeMock = vi.fn();
const previewMock = vi.fn();
const enabledMock = vi.fn(() => true);

vi.mock('../../lib/growYourBusiness/growYourBusinessService.js', () => ({
  analyzeGrowYourBusinessIntent: (...args) => analyzeMock(...args),
  previewGrowYourBusinessIntent: (...args) => previewMock(...args),
  GrowYourBusinessError: class GrowYourBusinessError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
      this.name = 'GrowYourBusinessError';
    }
  },
}));

vi.mock('../../lib/growYourBusiness/growYourBusinessConfig.js', () => ({
  isGrowYourBusinessV1Enabled: () => enabledMock(),
  GROW_YOUR_BUSINESS_MAX_RAW_TEXT: 12000,
}));

import growYourBusinessRoutes from '../growth/growYourBusinessRoutes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(requestResponseStateMiddleware);
  app.use(latencyGuard);
  app.use('/api/growth/opportunities', growYourBusinessRoutes);
  return app;
}

describe('growYourBusinessRoutes', () => {
  beforeEach(() => {
    analyzeMock.mockReset();
    previewMock.mockReset();
    enabledMock.mockReturnValue(true);
  });

  it('returns understanding for authenticated users', async () => {
    analyzeMock.mockResolvedValueOnce({
      ok: true,
      status: 'understood',
      understanding: {
        youHave: { label: 'Sản xuất đá dẻo', location: 'Việt Nam' },
        youWant: { label: 'Nhà phân phối', location: 'Australia' },
        usedBusinessContext: false,
        confidence: 'high',
      },
      clarification: null,
      opportunities: [],
      nextActions: [{ id: 'research_market' }],
      empty: true,
      retryable: false,
      error: null,
    });

    const res = await request(makeApp())
      .post('/api/growth/opportunities/analyze')
      .send({
        rawText:
          'Chúng tôi là công ty sản xuất đá dẻo tại Việt Nam, tìm nhà phân phối tại thị trường Australia.',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('understood');
    expect(res.body.understanding.youHave.label).toMatch(/đá dẻo/i);
    expect(JSON.stringify(res.body)).not.toMatch(/\bG1\b|\bG2\b|Market Intent/i);
  });

  it('rejects unauthorized access', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.headers['x-unauth'] = '1';
      next();
    });
    app.use(requestResponseStateMiddleware);
    app.use('/api/growth/opportunities', growYourBusinessRoutes);

    const res = await request(app)
      .post('/api/growth/opportunities/analyze')
      .set('x-unauth', '1')
      .send({ rawText: 'We manufacture flexible ice in Vietnam.' });

    expect(res.status).toBe(401);
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the feature flag is off', async () => {
    enabledMock.mockReturnValue(false);
    const res = await request(makeApp())
      .post('/api/growth/opportunities/analyze')
      .send({ rawText: 'We manufacture flexible ice in Vietnam.' });

    expect(res.status).toBe(404);
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it('uses long-running timeout class for growth analyze', async () => {
    analyzeMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                ok: true,
                status: 'understood',
                understanding: {
                  youHave: { label: 'ice', location: 'Vietnam' },
                  youWant: { label: 'distributors', location: 'Australia' },
                  usedBusinessContext: false,
                  confidence: 'high',
                },
                clarification: null,
                opportunities: [],
                nextActions: [],
                empty: true,
                retryable: false,
                error: null,
              }),
            80,
          );
        }),
    );

    process.env.API_REQUEST_TIMEOUT_MS = '30';
    process.env.API_LONG_RUNNING_TIMEOUT_MS = '5000';

    const res = await request(makeApp())
      .post('/api/growth/opportunities/analyze')
      .send({ rawText: 'We manufacture flexible ice in Vietnam and are looking for distributors in Australia.' });

    expect(res.status).toBe(200);

    delete process.env.API_REQUEST_TIMEOUT_MS;
    delete process.env.API_LONG_RUNNING_TIMEOUT_MS;
  });

  it('allows guest preview without auth and never returns opportunities', async () => {
    previewMock.mockResolvedValueOnce({
      ok: true,
      status: 'understood',
      understanding: {
        youHave: { label: 'Flexible ice manufacturing', location: 'Vietnam' },
        youWant: { label: 'Distributors', location: 'Australia' },
        usedBusinessContext: false,
        confidence: 'high',
      },
      clarification: null,
      opportunities: [{ id: 'should-not-leak', kind: 'verified_match', whoWhat: 'Secret Co', whyRelevant: '', matchWhy: '', location: null, confidenceLabel: null }],
      nextActions: [{ id: 'research_market' }, { id: 'save_request' }],
      empty: false,
      retryable: false,
      error: null,
      guestPreview: true,
    });

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.headers['x-unauth'] = '1';
      next();
    });
    app.use(requestResponseStateMiddleware);
    app.use('/api/growth/opportunities', growYourBusinessRoutes);

    const res = await request(app)
      .post('/api/growth/opportunities/preview')
      .set('x-unauth', '1')
      .send({
        rawText: 'We manufacture flexible ice in Vietnam and are looking for distributors in Australia.',
      });

    expect(res.status).toBe(200);
    expect(previewMock).toHaveBeenCalled();
    expect(analyzeMock).not.toHaveBeenCalled();
    expect(res.body.guestPreview).toBe(true);
    expect(res.body.opportunities).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(/Secret Co/);
    expect(res.body.nextActions.map((a) => a.id)).not.toContain('save_request');
  });

  it('keeps analyze unauthorized for guests', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.headers['x-unauth'] = '1';
      next();
    });
    app.use(requestResponseStateMiddleware);
    app.use('/api/growth/opportunities', growYourBusinessRoutes);

    const res = await request(app)
      .post('/api/growth/opportunities/analyze')
      .set('x-unauth', '1')
      .send({ rawText: 'We manufacture flexible ice in Vietnam.' });

    expect(res.status).toBe(401);
    expect(analyzeMock).not.toHaveBeenCalled();
    expect(previewMock).not.toHaveBeenCalled();
  });
});
