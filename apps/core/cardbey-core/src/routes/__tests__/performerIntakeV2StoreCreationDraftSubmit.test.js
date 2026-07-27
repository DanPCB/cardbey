/**
 * StoreCreationDraft [Create store] structured submit → checkpoint dispatch.
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/execution/kernelPipelineDispatch.js', () => ({
  dispatchCreateStoreViaKernel: vi.fn(async () => ({
    ok: true,
    mode: 'checkpoint_pipeline',
    missionId: 'mission-draft-submit-1',
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
        storeName: 'ABC Bakery',
        storeType: 'Food & drink',
        location: 'Melbourne',
        intentMode: 'store',
        _autoSubmit: true,
        source: 'store_creation_draft',
        storeCreationDraft: {
          name: 'ABC Bakery',
          category: 'Food & drink',
          location: 'Melbourne',
        },
        storeCreateForm: {
          storeName: 'ABC Bakery',
          storeType: 'Food & drink',
          location: 'Melbourne',
        },
      },
      _classificationSource: 'intent_reasoner',
      _reasoning: { intent: 'create_store', confidence: 1, action: 'execute_tool' },
    })),
  })),
  resetIntentIntegrationForTests: vi.fn(),
}));

vi.mock('../../lib/missionAccess.js', () => ({
  getTenantId: vi.fn(() => 'tenant-draft-submit'),
}));

const businessFindManyMock = vi.hoisted(() => vi.fn(async () => []));

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: vi.fn(() => ({
    business: { findMany: businessFindManyMock },
  })),
}));

vi.mock('../../lib/ocr/ocrProvider.js', () => ({
  ocrExtractText: vi.fn(async () => ''),
}));

vi.mock('../../lib/missionPipelineService.js', () => ({
  createMissionPipeline: vi.fn(async () => ({ id: 'mission-draft-submit-1' })),
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
    req.user = { id: 'user-draft-submit', business: { id: 'tenant-draft-submit' } };
    next();
  });
  app.use('/api/performer/intake/v2', performerIntakeV2Routes);
  return app;
}

describe('POST /api/performer/intake/v2 store_creation_draft submit', () => {
  beforeEach(() => {
    dispatchCreateStoreViaKernel.mockClear();
    businessFindManyMock.mockReset();
    businessFindManyMock.mockResolvedValue([]);
  });

  it('passes validation and starts store mission for complete draft submit', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/performer/intake/v2')
      .send({
        text: 'Create store: ABC Bakery · Food & drink · Melbourne',
        message: 'Create store: ABC Bakery · Food & drink · Melbourne',
        intent: 'create_store',
        source: 'store_creation_draft',
        _autoSubmit: true,
        freshStoreMission: true,
        storeCreateForm: {
          storeName: 'ABC Bakery',
          storeType: 'Food & drink',
          location: 'Melbourne',
          intentMode: 'store',
        },
        storeCreationDraft: {
          name: 'ABC Bakery',
          category: 'Food & drink',
          location: 'Melbourne',
          source: 'chat',
          missingFields: [],
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe('store_mission_started');
    expect(res.body.missionId).toBe('mission-draft-submit-1');
    expect(dispatchCreateStoreViaKernel).toHaveBeenCalledTimes(1);
    expect(res.body.action).not.toBe('capability_proposal_required');
    expect(res.body.action).not.toBe('proactive_plan');
  });

  it('returns duplicate_store when business name already exists for user', async () => {
    businessFindManyMock.mockResolvedValue([
      {
        id: 'store-abc-existing',
        name: 'ABC Bakery',
        city: 'Melbourne',
        suburb: null,
        region: null,
        formattedAddress: null,
      },
    ]);
    const app = makeApp();
    const res = await request(app)
      .post('/api/performer/intake/v2')
      .send({
        message: 'Create store: ABC Bakery · Food & drink · Melbourne',
        intent: 'create_store',
        source: 'store_creation_draft',
        _autoSubmit: true,
        freshStoreMission: true,
        storeCreateForm: {
          storeName: 'ABC Bakery',
          storeType: 'Food & drink',
          location: 'Melbourne',
          intentMode: 'store',
        },
        storeCreationDraft: {
          name: 'ABC Bakery',
          category: 'Food & drink',
          location: 'Melbourne',
          source: 'chat',
          missingFields: [],
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('duplicate_store');
    expect(res.body.existingStoreId).toBe('store-abc-existing');
    expect(res.body.fact?.event).toBe('entity_conflict');
    expect(res.body.fact?.reason).toBe('duplicate_name');
    expect(res.body.actions).toContain('open_existing');
    expect(dispatchCreateStoreViaKernel).not.toHaveBeenCalled();
  });

  it('rejects malformed intake source without capability gap action', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/performer/intake/v2')
      .send({
        text: 'Create store: ABC Bakery · Food & drink · Melbourne',
        source: 'totally_invalid_source',
        _autoSubmit: true,
        storeCreateForm: {
          storeName: 'ABC Bakery',
          storeType: 'Food & drink',
          location: 'Melbourne',
        },
        currentContext: {},
        history: [],
      });

    expect(res.status).toBe(400);
    expect(res.body.errors?.some((e) => e.field === 'source')).toBe(true);
    expect(res.body.action).toBe('validation_error');
    expect(res.body.action).not.toBe('capability_proposal_required');
  });

  it('rejects unknown business field in storeCreateForm', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/performer/intake/v2')
      .send({
        text: 'Create store: ABC Bakery · Food & drink · Melbourne',
        source: 'store_creation_draft',
        storeCreateForm: {
          storeName: 'ABC Bakery',
          storeType: 'Food & drink',
          location: 'Melbourne',
          unknownBusinessField: 'nope',
        },
        currentContext: {},
        history: [],
      });

    expect(res.status).toBe(400);
    expect(res.body.errors?.some((e) => String(e.field).includes('unknownBusinessField'))).toBe(true);
    expect(res.body.action).toBe('validation_error');
  });
});
