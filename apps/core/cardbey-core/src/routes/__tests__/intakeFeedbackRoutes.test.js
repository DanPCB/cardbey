/**
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUniqueMock = vi.fn();
const createMock = vi.fn();
const groupByMock = vi.fn();

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { id: 'user-test-1' };
    next();
  },
}));

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: () => ({
    skillDispatchLog: { findUnique: findUniqueMock },
    skillDispatchFeedback: { create: createMock, groupBy: groupByMock },
  }),
}));

import intakeFeedbackRoutes from '../intakeFeedbackRoutes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/intake', intakeFeedbackRoutes);
  return app;
}

describe('POST /api/intake/feedback', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    createMock.mockReset();
    groupByMock.mockReset();
  });

  it('creates feedback when dispatch log exists', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'log-1',
      intent: 'campaign.launch',
      matchedSkill: 'launch_campaign',
    });
    createMock.mockResolvedValue({
      id: 'fb-1',
      dispatchLogId: 'log-1',
      userId: 'user-test-1',
      rating: 5,
      correctionText: null,
    });

    const res = await request(makeApp())
      .post('/api/intake/feedback')
      .send({ dispatchLogId: 'log-1', rating: 5 });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.feedback).toMatchObject({ id: 'fb-1', rating: 5 });
    expect(createMock).toHaveBeenCalledWith({
      data: {
        dispatchLogId: 'log-1',
        userId: 'user-test-1',
        rating: 5,
        correctionText: null,
      },
    });
  });

  it('returns 404 when dispatch log is missing', async () => {
    findUniqueMock.mockResolvedValue(null);

    const res = await request(makeApp())
      .post('/api/intake/feedback')
      .send({ dispatchLogId: 'missing', rating: 5 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Dispatch log not found');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid rating', async () => {
    const res = await request(makeApp())
      .post('/api/intake/feedback')
      .send({ dispatchLogId: 'log-1', rating: 0 });

    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('stores correction text when provided', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'log-2',
      intent: 'store.analyze',
      matchedSkill: 'analyze_store',
    });
    createMock.mockResolvedValue({
      id: 'fb-2',
      dispatchLogId: 'log-2',
      rating: 1,
      correctionText: 'I wanted to edit my menu',
    });

    const res = await request(makeApp())
      .post('/api/intake/feedback')
      .send({
        dispatchLogId: 'log-2',
        rating: 1,
        correctionText: '  I wanted to edit my menu  ',
      });

    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        correctionText: 'I wanted to edit my menu',
      }),
    });
  });
});

describe('GET /api/intake/feedback/stats/:dispatchLogId', () => {
  beforeEach(() => {
    groupByMock.mockReset();
  });

  it('returns grouped rating stats', async () => {
    groupByMock.mockResolvedValue([
      { rating: 5, _count: 3 },
      { rating: 1, _count: 1 },
    ]);

    const res = await request(makeApp()).get('/api/intake/feedback/stats/log-1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.stats).toHaveLength(2);
    expect(groupByMock).toHaveBeenCalledWith({
      by: ['rating'],
      where: { dispatchLogId: 'log-1' },
      _count: true,
    });
  });
});
