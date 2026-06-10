/**
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => {
    req.userId = 'admin-user';
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
  optionalAuth: (req, _res, next) => {
    req.userId = null;
    next();
  },
}));

import runtimeDiagnosticsRoutes from '../runtimeDiagnosticsRoutes.js';
import { clearRuntimeDiagnosticsForTests } from '../../lib/runtimeDiagnostics/index.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/runtime', runtimeDiagnosticsRoutes);
  return app;
}

describe('runtime diagnostics routes', () => {
  beforeEach(() => {
    clearRuntimeDiagnosticsForTests();
    process.env.RUNTIME_DIAGNOSTICS_ENABLED = 'true';
  });

  it('POST /api/runtime/diagnostics stores sanitized diagnostic', async () => {
    const res = await request(makeApp())
      .post('/api/runtime/diagnostics')
      .send({
        source: 'frontend',
        severity: 'error',
        category: 'media',
        eventName: 'hero_video_cors_blocked',
        message: 'Cross-Origin Request Blocked',
        evidence: {
          url: 'https://media.cardbey.com/hero.mp4?token=secret',
          readyState: 0,
          networkState: 3,
        },
      });

    expect(res.status).toBe(201);

    expect(res.body.ok).toBe(true);
    expect(res.body.diagnosticId).toBeTruthy();
    expect(res.body.classification.kind).toBe('media_cors_blocked');
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('GET /api/runtime/diagnostics/recent returns stored rows for admin', async () => {
    const app = makeApp();
    await request(app)
      .post('/api/runtime/diagnostics')
      .send({
        source: 'frontend',
        severity: 'warning',
        category: 'deployment',
        eventName: 'deploy_version_mismatch',
        message: 'commit mismatch',
        evidence: { frontendCommitSha: 'a', backendCommitSha: 'b' },
      })
      .expect(201);

    const recent = await request(app).get('/api/runtime/diagnostics/recent').expect(200);
    expect(recent.body.ok).toBe(true);
    expect(recent.body.diagnostics.length).toBeGreaterThan(0);
    expect(recent.body.diagnostics[0].classification.kind).toBe('deploy_version_mismatch');
  });

  it('rate limits anonymous ingest', async () => {
    const app = makeApp();
    let lastStatus = 201;
    for (let i = 0; i < 65; i += 1) {
      const res = await request(app)
        .post('/api/runtime/diagnostics')
        .send({
          source: 'frontend',
          severity: 'info',
          category: 'unknown',
          eventName: `spam_${i}`,
          message: 'spam',
        });
      lastStatus = res.status;
      if (lastStatus === 429) break;
    }
    expect(lastStatus).toBe(429);
  });

  it('GET /api/runtime/version returns service metadata', async () => {
    const res = await request(makeApp()).get('/api/runtime/version').expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe('cardbey-core');
    expect(res.body).toHaveProperty('commitSha');
  });
});
