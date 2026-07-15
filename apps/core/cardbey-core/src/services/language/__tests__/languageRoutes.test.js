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
  ensureDashboardI18nReady: vi.fn(async () => ({
    dashboardRoot,
    source: 'submodule',
  })),
}));

vi.mock('../languageApply.js', () => ({
  default: {
    applyFix: vi.fn(async () => ({ success: true, auditId: 'audit-1', backupPath: '/tmp/bak' })),
    getHistory: vi.fn(() => [
      {
        id: 'audit-1',
        key: 'translation.nav.dashboard',
        success: true,
        timestamp: new Date().toISOString(),
      },
    ]),
    rollbackTo: vi.fn(async () => ({ success: true })),
  },
}));

import languageRoutes from '../../../routes/languageRoutes.js';
import languageAgent from '../languageAgent.js';
import { clearLanguageAuditForTests } from '../languageExecutionAudit.js';

describe('languageRoutes', () => {
  let app;

  beforeEach(() => {
    clearLanguageAuditForTests();
    languageAgent.scanResults = null;
    languageAgent.previewResults = [];
    languageAgent.isRunning = false;

    app = express();
    app.use(express.json());
    app.use('/api/language', languageRoutes);
  });

  it('GET /status returns phase 2 governed guarantees', async () => {
    const res = await request(app).get('/api/language/status');
    expect(res.status).toBe(200);
    expect(res.body.status.phase).toBe(2);
    expect(res.body.status.guarantees.governedApply).toBe(true);
    expect(res.body.status.guarantees.autoApply).toBe(false);
  });

  it('POST /scan returns read-only scan summary', async () => {
    const res = await request(app).post('/api/language/scan');
    expect(res.status).toBe(200);
    expect(res.body.result.mode).toBe('read_only');
  });

  it('POST /preview stores preview without applying', async () => {
    const res = await request(app)
      .post('/api/language/preview')
      .send({
        issue: {
          key: 'translation.nav.dashboard',
          value: 'Dashboard',
          english: 'Live Performance',
          issue: 'invalid_vietnamese',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.previews[0].applied).toBe(false);
  });

  it('POST /fixes/:id/approve marks fix approved', async () => {
    languageAgent.previewResults = [
      {
        id: 'fix-abc',
        key: 'translation.nav.dashboard',
        current: 'Dashboard',
        fixed: 'Bảng điều khiển',
        approved: false,
        applied: false,
      },
    ];

    const res = await request(app).post('/api/language/fixes/fix-abc/approve');
    expect(res.status).toBe(200);
    expect(res.body.fix.approved).toBe(true);
  });

  it('POST /fixes/:id/apply requires confirmation', async () => {
    languageAgent.previewResults = [
      {
        id: 'fix-abc',
        key: 'translation.nav.dashboard',
        current: 'Dashboard',
        fixed: 'Bảng điều khiển',
        approved: true,
        applied: false,
      },
    ];

    const denied = await request(app).post('/api/language/fixes/fix-abc/apply').send({});
    expect(denied.status).toBe(400);
    expect(denied.body.error).toBe('confirmation_required');

    const res = await request(app)
      .post('/api/language/fixes/fix-abc/apply')
      .send({ confirmed: true });
    expect(res.status).toBe(200);
    expect(res.body.result.success).toBe(true);
    expect(languageAgent.previewResults[0].applied).toBe(true);
  });

  it('GET /history returns audit entries', async () => {
    const res = await request(app).get('/api/language/history');
    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(1);
  });
});
