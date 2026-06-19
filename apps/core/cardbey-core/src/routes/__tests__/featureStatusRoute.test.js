import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import healthRoutes from '../healthRoutes.js';

function buildApp() {
  const app = express();
  app.use('/api', healthRoutes);
  return app;
}

describe('GET /api/status/features', () => {
  it('returns feature availability map', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/status/features');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.features).toBeDefined();
    expect(typeof res.body.features.video.available).toBe('boolean');
    expect(typeof res.body.features.cnet.available).toBe('boolean');
    expect(res.body.features.ocr.available).toBe(false);
    expect(res.body.features.social.available).toBe(true);
  });
});
