/**
 * POST /api/vision/intake — validation and rate limit.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import visionIntakeRoutes from '../src/routes/visionIntake.js';

vi.mock('../src/middleware/guestAuth.js', () => ({
  requireUserOrGuest: (req, _res, next) => {
    req.user = { id: 'vision-test-user' };
    next();
  },
}));

vi.mock('../src/lib/vision/visionIntakeService.js', () => ({
  runVisionIntake: vi.fn(async () => ({
    ok: true,
    event: { id: 'evt', intent: 'qr_payload' },
    needsLocation: false,
    classification: { intent: 'qr_payload', confidence: 1 },
    route: { action: 'open_store', slug: 'demo' },
  })),
}));

import { runVisionIntake } from '../src/lib/vision/visionIntakeService.js';

function buildTestApp() {
  const app = express();
  app.use('/api/vision', visionIntakeRoutes);
  return app;
}

describe('POST /api/vision/intake', () => {
  beforeEach(() => {
    vi.mocked(runVisionIntake).mockClear();
  });

  it('returns 400 when intake is empty', async () => {
    vi.mocked(runVisionIntake).mockResolvedValueOnce({
      ok: false,
      error: { code: 'empty_intake', message: 'Provide at least one image or a decoded QR/barcode payload.' },
    });

    const res = await request(buildTestApp())
      .post('/api/vision/intake')
      .field('surface', 'chat')
      .expect(400);

    expect(res.body.code).toBe('empty_intake');
  });

  it('accepts decodedPayload without images', async () => {
    const res = await request(buildTestApp())
      .post('/api/vision/intake')
      .field('surface', 'feed')
      .field('decodedPayload', 'https://www.cardbey.com/s/demo-cafe')
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.route.action).toBe('open_store');
    expect(runVisionIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        decodedPayload: 'https://www.cardbey.com/s/demo-cafe',
        surface: 'feed',
      }),
    );
  });

});
