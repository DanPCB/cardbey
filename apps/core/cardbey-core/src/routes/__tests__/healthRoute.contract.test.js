/**
 * Contract: GET /api/health returns lightweight JSON without external API keys.
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/prisma.js', () => ({
  testDatabaseConnection: vi.fn().mockResolvedValue({ ok: true, dialect: 'sqlite', latencyMs: 1 }),
}));

vi.mock('../../realtime/sse.js', () => ({
  isSseHealthy: vi.fn().mockReturnValue(true),
}));

vi.mock('../../scheduler/heartbeat.js', () => ({
  getStatus: vi.fn().mockReturnValue({ ok: true, lastBeat: Date.now() }),
}));

vi.mock('../../auth/providers.js', () => ({
  getOAuthStatus: vi.fn().mockResolvedValue({ configured: false }),
}));

vi.mock('../../lib/schemaFingerprint.js', () => ({
  buildHealthDbFingerprint: vi.fn().mockReturnValue({
    ok: true,
    environment: 'test',
    provider: 'sqlite',
    databaseKind: 'sqlite',
    requiredColumnsOk: true,
    warnings: [],
  }),
}));

import healthRoutes from '../healthRoutes.js';

function appWithHealth() {
  const app = express();
  app.use('/api', healthRoutes);
  return app;
}

describe('GET /api/health (contract)', () => {
  it('returns 200 with ok:true (simple)', async () => {
    const res = await request(appWithHealth()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toMatchObject({ ok: true, status: 'ok' });
    expect(typeof res.body.timestamp).toBe('string');
    expect(res.body.features).toBeUndefined();
    expect(res.body.decisionLoop).toBeUndefined();
  });

  it('returns 200 with full payload when ?full=true', async () => {
    const res = await request(appWithHealth()).get('/api/health?full=true');
    expect(res.status).toBe(200);
    expect(res.body.api).toMatchObject({ ok: true });
    expect(res.body.database).toMatchObject({ ok: true });
    expect(res.body.sse).toMatchObject({ path: '/api/stream' });
    expect(res.body.deploy).toMatchObject({
      commitSha: expect.any(String),
      environment: expect.any(String),
      source: expect.any(String),
    });
    expect(res.body.intake?.decisionLoop).toMatchObject({
      enabled: expect.any(Boolean),
      running: expect.any(Boolean),
    });
  });

  it('GET /api/ping returns ok', async () => {
    const res = await request(appWithHealth()).get('/api/ping');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, status: 'ok' });
  });
});
