import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import performerIntakeV2Routes from '../performerIntakeV2Routes.js';

function appWithIntakeV2() {
  const app = express();
  app.use('/api/performer/intake/v2', performerIntakeV2Routes);
  return app;
}

describe('GET /api/performer/intake/v2', () => {
  it('returns JSON health payload', async () => {
    const res = await request(appWithIntakeV2()).get('/api/performer/intake/v2');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toMatchObject({ status: 'ok', version: 'v2' });
    expect(typeof res.body.env).toBe('string');
  });
});
