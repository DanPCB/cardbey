/**
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn(async (args) => ({
  id: 'tel-1',
  eventType: args.data.eventType,
  storageKey: args.data.storageKey ?? null,
  url: args.data.url ?? null,
  attemptNumber: args.data.attemptNumber ?? null,
  environment: args.data.environment ?? null,
}));

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (_req, _res, next) => next(),
  requireAdmin: (_req, _res, next) => next(),
  optionalAuth: (req, _res, next) => {
    req.userId = 'user-hero-1';
    next();
  },
}));

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: () => ({
    telemetryHeroVideo: {
      create: createMock,
    },
  }),
}));

import telemetryRoutes from '../telemetryRoutes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/telemetry', telemetryRoutes);
  return app;
}

describe('POST /api/telemetry/hero-video', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records verify.failed events', async () => {
    const res = await request(makeApp())
      .post('/api/telemetry/hero-video')
      .send({
        event: 'verify.failed',
        url: 'https://cdn.example.com/media/hero.mp4',
        attempt: 5,
        status: 404,
        durationMs: 4500,
        environment: 'staging',
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.id).toBe('tel-1');
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'verify.failed',
          userId: 'user-hero-1',
          storageKey: 'media/hero.mp4',
          attemptNumber: 5,
        }),
      }),
    );
  });

  it('returns 400 for invalid event type', async () => {
    const res = await request(makeApp())
      .post('/api/telemetry/hero-video')
      .send({ event: 'not.real' })
      .expect(400);

    expect(res.body.ok).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });
});
