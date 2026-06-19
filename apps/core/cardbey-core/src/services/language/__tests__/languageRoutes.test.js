import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import path from 'node:path';
import request from 'supertest';

const dashboardRoot = path.resolve(process.cwd(), '../../dashboard/cardbey-marketing-dashboard');

vi.mock('../../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { id: 'admin-test', role: 'platform_admin' };
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
}));

vi.mock('../../../lib/intake/i18nMaintenanceTools.js', () => ({
  detectI18nGaps: vi.fn(async () => ({
    status: 'ok',
    count: 1,
    fileCount: 1,
    items: [{ file: 'src/pages/Foo.tsx', line: 10, string: 'Hello', suggestedKey: 'foo.hello' }],
    exitCode: 0,
  })),
  getDashboardPackageRoot: vi.fn(() => dashboardRoot),
}));

import languageRoutes from '../../../routes/languageRoutes.js';
import languageAgent from '../languageAgent.js';

describe('languageRoutes (Phase 1 read-only)', () => {
  let app;

  beforeEach(() => {
    languageAgent.scanResults = null;
    languageAgent.previewResults = [];
    languageAgent.isRunning = false;

    app = express();
    app.use(express.json());
    app.use('/api/language', languageRoutes);
  });

  it('GET /status returns idle status', async () => {
    const res = await request(app).get('/api/language/status');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status.guarantees.sourceMutation).toBe(false);
    expect(res.body.status.guarantees.autoApply).toBe(false);
  });

  it('POST /scan returns read-only scan summary', async () => {
    const res = await request(app).post('/api/language/scan');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.result.mode).toBe('read_only');
    expect(res.body.result.summary).toBeDefined();
  });

  it('POST /preview stores preview without applying', async () => {
    const res = await request(app)
      .post('/api/language/preview')
      .send({ issue: { key: 'nav.dashboard', value: 'Dashboard', english: 'Dashboard', issue: 'invalid_vietnamese' } });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.result.fixed).toBeTruthy();
    expect(res.body.previews).toHaveLength(1);
    expect(res.body.previews[0].applied).toBe(false);
  });
});
