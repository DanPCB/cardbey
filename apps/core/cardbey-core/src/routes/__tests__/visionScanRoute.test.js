import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../lib/vision/cardScanPipeline.js', () => ({
  runCardScanPipeline: vi.fn(async () => ({
    ok: true,
    ocrText: 'Acme',
    confidence: 0.9,
    provider: 'openai_vision',
    extractedData: { name: 'Acme', confidence: 0.9 },
    preview: { name: 'Acme' },
  })),
}));

vi.mock('../../services/vision/productCreator.js', () => ({
  createFromScan: vi.fn(async () => ({
    ok: true,
    product: { id: 'p1', name: 'Acme' },
    message: 'created',
  })),
}));

vi.mock('../../middleware/guestAuth.js', () => ({
  requireUserOrGuest: (req, _res, next) => {
    req.user = { id: 'user-1' };
    next();
  },
}));

vi.mock('../../middleware/rateLimit.js', () => ({
  rateLimit: () => (_req, _res, next) => next(),
}));

import visionRoutes from '../visionIntake.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/vision', visionRoutes);
  return app;
}

describe('POST /api/vision/scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 without image', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/vision/scan').field('storeId', 's1');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('NO_IMAGE');
  });

  it('returns preview with image upload', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/vision/scan')
      .field('storeId', 's1')
      .attach('image', Buffer.from('fake-image'), 'card.jpg');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.preview?.name).toBe('Acme');
  });
});

describe('POST /api/vision/scan/confirm', () => {
  it('requires confirmation flag', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/vision/scan/confirm')
      .send({ storeId: 's1', extractedData: { name: 'Acme' }, confirmed: false });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CONFIRMATION_REQUIRED');
  });

  it('creates product when confirmed', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/vision/scan/confirm')
      .send({ storeId: 's1', extractedData: { name: 'Acme' }, confirmed: true });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.product?.id).toBe('p1');
  });
});
