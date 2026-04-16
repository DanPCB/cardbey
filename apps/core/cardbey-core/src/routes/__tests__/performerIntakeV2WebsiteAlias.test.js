/**
 * Intake V2 website aliases should resolve to create_store, not campaign flows.
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/guestAuth.js', () => ({
  requireUserOrGuest: (_req, _res, next) => next(),
}));

vi.mock('../../lib/intake/intakeClassifier.js', () => ({
  classifyIntent: vi.fn(async () => ({
    executionPath: 'direct_action',
    tool: 'create_store',
    confidence: 0.95,
    parameters: { _autoSubmit: true },
  })),
  CONFIDENCE: { HIGH: 0.8, MEDIUM: 0.55, LOW: 0 },
  FALLBACK_CLARIFY: { clarifyOptions: [] },
}));

vi.mock('../../lib/missionAccess.js', () => ({
  getTenantId: vi.fn(() => 'biz-website-alias'),
}));

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: vi.fn(() => ({})),
}));

vi.mock('../../lib/ocr/ocrProvider.js', () => ({
  ocrExtractText: vi.fn(async () => ''),
}));

vi.mock('../../lib/missionPipelineService.js', () => ({
  createMissionPipeline: vi.fn(async () => ({ id: 'mission-store-1' })),
}));

vi.mock('../../lib/storeMission/executeStoreMissionPipelineRun.js', () => ({
  executeStoreMissionPipelineRun: vi.fn(async () => ({
    ok: true,
    missionId: 'mission-store-1',
    jobId: 'job-store-1',
    generationRunId: 'gen-store-1',
    draftId: 'draft-store-1',
  })),
}));

import performerIntakeV2Routes from '../performerIntakeV2Routes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'user-website-alias', business: { id: 'biz-website-alias' } };
    next();
  });
  app.use('/api/performer/intake/v2', performerIntakeV2Routes);
  return app;
}

describe('POST /api/performer/intake/v2 website aliases', () => {
  it('routes "create a website from attached card" to create_store website mode', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/performer/intake/v2')
      .send({
        text: 'create a website from attached card',
        attachments: [{ type: 'image', url: 'https://example.com/card.jpg' }],
        currentContext: {},
        history: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe('create_store');
    expect(res.body.intentMode).toBe('website');
  });

  it('keeps "create a store for Construct Corp" on create_store flow', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/performer/intake/v2')
      .send({
        text: 'create a store for Construct Corp',
        currentContext: {},
        history: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe('store_mission_started');
    expect(res.body.storeMissionSummary?.businessName).toBe('Construct Corp');
    expect(res.body.intentMode ?? 'store').toBe('store');
  });
});
