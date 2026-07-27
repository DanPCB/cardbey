import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../lib/schemaFingerprint.js', () => ({
  buildHealthDbFingerprint: vi.fn(),
}));

const { buildHealthDbFingerprint } = await import('../../lib/schemaFingerprint.js');
import healthRoutes from '../healthRoutes.js';

describe('GET /api/health/db', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use('/api', healthRoutes);
    vi.mocked(buildHealthDbFingerprint).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns fingerprint and 200 when ok', async () => {
    vi.mocked(buildHealthDbFingerprint).mockReturnValue({
      ok: true,
      environment: 'development',
      provider: 'sqlite',
      databaseKind: 'sqlite',
      resolvedDbLabel: 'dev.db',
      resolvedDbPath: '/tmp/prisma/dev.db',
      schemaPrismaHash: 'abc',
      requiredColumnsOk: true,
      warnings: [],
    });
    const res = await request(app).get('/api/health/db');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.resolvedDbPath).toBe('/tmp/prisma/dev.db');
  });

  it('returns 503 when fingerprint not ok', async () => {
    vi.mocked(buildHealthDbFingerprint).mockReturnValue({
      ok: false,
      environment: 'production',
      provider: 'sqlite',
      warnings: ['sqlite_in_production'],
    });
    const res = await request(app).get('/api/health/db');
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.resolvedDbPath).toBeUndefined();
  });
});
