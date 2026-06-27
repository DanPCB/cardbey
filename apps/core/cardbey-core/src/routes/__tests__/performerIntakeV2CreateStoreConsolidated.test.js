/**
 * create_store must always run checkpoint pipeline via kernel dispatch (no legacy flags).
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/execution/kernelPipelineDispatch.js', () => ({
  dispatchCreateStoreViaKernel: vi.fn(async () => ({
    ok: true,
    mode: 'checkpoint_pipeline',
    missionId: 'mission-consolidated-1',
    jobId: null,
    generationRunId: null,
    draftId: null,
    dispatchedVia: 'runtime_kernel',
  })),
}));

vi.mock('../../middleware/guestAuth.js', () => ({
  requireUserOrGuest: (_req, _res, next) => next(),
}));

vi.mock('../../lib/intent/campaignOrchestrationIntent.js', () => ({
  isCampaignOrchestrationIntent: vi.fn(() => false),
}));

vi.mock('../../lib/intent/intentIntegration.js', () => ({
  getIntentIntegration: vi.fn(() => ({
    processIntake: vi.fn(async () => ({
      executionPath: 'proactive_plan',
      tool: 'create_store',
      confidence: 1,
      parameters: {
        storeName: 'My Beauty',
        storeType: 'Beauty',
        location: 'Melbourne',
        intentMode: 'store',
      },
      _classificationSource: 'intent_reasoner',
      _reasoning: { intent: 'create_store', confidence: 1, action: 'execute_tool' },
    })),
  })),
  resetIntentIntegrationForTests: vi.fn(),
}));

vi.mock('../../lib/missionAccess.js', () => ({
  getTenantId: vi.fn(() => 'tenant-consolidated'),
}));

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: vi.fn(() => ({
    business: { findMany: vi.fn(async () => []) },
  })),
}));

vi.mock('../../lib/ocr/ocrProvider.js', () => ({
  ocrExtractText: vi.fn(async () => ''),
}));

vi.mock('../../lib/missionPipelineService.js', () => ({
  createMissionPipeline: vi.fn(async () => ({ id: 'mission-consolidated-1' })),
}));

vi.mock('../../lib/storeMission/ensureStructuredStoreCheckpointSteps.js', () => ({
  ensureStructuredStoreCheckpointSteps: vi.fn(async () => {}),
}));

import performerIntakeV2Routes from '../performerIntakeV2Routes.js';
import { dispatchCreateStoreViaKernel } from '../../lib/execution/kernelPipelineDispatch.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'user-consolidated', business: { id: 'tenant-consolidated' } };
    next();
  });
  app.use('/api/performer/intake/v2', performerIntakeV2Routes);
  return app;
}

describe('POST /api/performer/intake/v2 consolidated create_store', () => {
  beforeEach(() => {
    dispatchCreateStoreViaKernel.mockClear();
  });

  it('runs checkpoint pipeline for structured form submit (kernel dispatch, no legacy flags)', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/performer/intake/v2')
      .send({
        text: 'My Beauty · Beauty · Melbourne',
        storeCreateForm: {
          storeName: 'My Beauty',
          storeType: 'Beauty',
          location: 'Melbourne',
          intentMode: 'store',
        },
        currentContext: {},
        history: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe('store_mission_started');
    expect(res.body.missionId).toBe('mission-consolidated-1');
    expect(res.body.storeMissionSummary?.businessName).toBe('My Beauty');
    expect(dispatchCreateStoreViaKernel).toHaveBeenCalledTimes(1);
    expect(res.body.action).not.toBe('proactive_plan');
  });
});
