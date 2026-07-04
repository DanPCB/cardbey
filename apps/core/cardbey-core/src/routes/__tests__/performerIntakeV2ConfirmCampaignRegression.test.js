/**
 * Regression: brunch campaign → confirm must dispatch, not validation clarify loop.
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  runCreateCampaignViaUnifiedDispatchMock,
  runIntakeAuthorityGateEarlyMock,
  mockProcessIntake,
} = vi.hoisted(() => ({
  runCreateCampaignViaUnifiedDispatchMock: vi.fn(async () => ({
    kind: 'started',
    responseBody: {
      success: true,
      action: 'campaign_mission_started',
      missionId: 'mission-campaign-1',
      response: 'Started building your campaign…',
    },
    telemetry: {
      classification: { executionPath: 'kernel_dispatch', tool: 'create_campaign', confidence: 1 },
      validated: true,
      downgraded: false,
      validationErrors: [],
      riskLevel: 'state_change',
      result: 'success',
    },
  })),
  runIntakeAuthorityGateEarlyMock: vi.fn(async () => ({
    handled: false,
    classification: null,
  })),
  mockProcessIntake: vi.fn(async () => ({
    executionPath: 'chat',
    tool: 'general_chat',
    confidence: 0.5,
    parameters: {},
    _classificationSource: 'intent_reasoner',
  })),
}));

vi.mock('../../middleware/guestAuth.js', () => ({
  requireUserOrGuest: (_req, _res, next) => next(),
}));

vi.mock('../../lib/intent/campaignOrchestrationIntent.js', () => ({
  isCampaignOrchestrationIntent: vi.fn(() => false),
}));

vi.mock('../../lib/intent/intentIntegration.js', () => ({
  getIntentIntegration: vi.fn(() => ({ processIntake: mockProcessIntake })),
  resetIntentIntegrationForTests: vi.fn(),
}));

vi.mock('../../lib/intake/intakeV2AuthorityTurn.js', () => ({
  runIntakeAuthorityTurn: vi.fn(async () => ({ handled: false })),
  runIntakeAuthorityGateEarly: (...args) => runIntakeAuthorityGateEarlyMock(...args),
}));

vi.mock('../../lib/intake/createCampaignCheckpointDispatch.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    runCreateCampaignViaUnifiedDispatch: (...args) => runCreateCampaignViaUnifiedDispatchMock(...args),
  };
});

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: vi.fn(() => ({
    business: { findMany: vi.fn(async () => [{ id: 'store-1', name: 'Weekend Brunch' }]) },
    missionPipeline: {
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    },
  })),
}));

vi.mock('../../lib/ocr/ocrProvider.js', () => ({
  ocrExtractText: vi.fn(async () => ''),
}));

vi.mock('../../services/conversation/conversationIntakeBridge.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    bootstrapConversationForIntake: vi.fn(async () => ({ session: null, context: null, history: [] })),
    finalizeConversationIntakeResponse: vi.fn(async (_session, _ctx, payload) => payload),
    attachConversationToMissionMetadata: vi.fn((metadata) => metadata),
  };
});

vi.mock('../../lib/intake/intakeTelemetry.js', () => ({
  emitIntakeV2Telemetry: vi.fn(async () => 'telemetry-log-id'),
}));

import performerIntakeV2Routes from '../performerIntakeV2Routes.js';
import {
  setPendingIntakeConfirmation,
  clearPendingIntakeConfirmationStoreForTests,
} from '../../lib/intake/intakePendingConfirmationStore.js';
import { clearIntakeTurnIdempotencyForTests } from '../../lib/intake/intakeTurnIdempotency.js';

function makeApp(user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/performer/intake/v2', performerIntakeV2Routes);
  return app;
}

describe('POST /api/performer/intake/v2 — confirm campaign regression', () => {
  beforeEach(() => {
    process.env.INTAKE_DECISION_LOOP_AUTHORITY = 'true';
    clearPendingIntakeConfirmationStoreForTests();
    clearIntakeTurnIdempotencyForTests();
    runCreateCampaignViaUnifiedDispatchMock.mockClear();
    runIntakeAuthorityGateEarlyMock.mockClear();
    mockProcessIntake.mockClear();
  });

  afterEach(() => {
    delete process.env.INTAKE_DECISION_LOOP_AUTHORITY;
    clearPendingIntakeConfirmationStoreForTests();
    clearIntakeTurnIdempotencyForTests();
  });

  it('replays brunch → confirm via pending store when decision loop authority is off', async () => {
    delete process.env.INTAKE_DECISION_LOOP_AUTHORITY;

    setPendingIntakeConfirmation({
      actorKey: 'u:user-brunch-off',
      tenantKey: 't:user-brunch-off',
      storeId: 'store-1',
      tool: 'create_campaign',
      originalGoal: 'create a weekend brunch promotion campaign for my store',
    });

    const app = makeApp({ id: 'user-brunch-off', business: undefined });
    const res = await request(app)
      .post('/api/performer/intake/v2')
      .send({
        userMessage: 'confirm',
        currentContext: { activeStoreId: 'store-1' },
        history: [
          {
            role: 'user',
            content: 'create a weekend brunch promotion campaign for my store',
          },
          {
            role: 'assistant',
            content: 'Please confirm before proceeding: create_campaign',
          },
        ],
        clientRequestId: 'req-confirm-loop-off',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe('campaign_mission_started');
    expect(runCreateCampaignViaUnifiedDispatchMock).toHaveBeenCalled();
    expect(mockProcessIntake).not.toHaveBeenCalled();
  });

  it('replays brunch → confirm transcript via pending store and dispatches create_campaign', async () => {
    setPendingIntakeConfirmation({
      actorKey: 'u:user-brunch',
      tenantKey: 't:user-brunch',
      missionId: 'mission-brunch',
      storeId: 'store-1',
      tool: 'create_campaign',
      originalGoal: 'create a weekend brunch promotion campaign for my store',
    });

    const app = makeApp({ id: 'user-brunch', business: undefined });
    const res = await request(app)
      .post('/api/performer/intake/v2')
      .send({
        userMessage: 'confirm',
        currentContext: { activeStoreId: 'store-1', activeMissionId: 'mission-brunch' },
        history: [
          {
            role: 'user',
            content: 'create a weekend brunch promotion campaign for my store',
          },
          {
            role: 'assistant',
            content: 'Please confirm before proceeding: create_campaign',
          },
        ],
        intentSourceContext: {
          pendingImageDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          uploadedAssetPending: true,
        },
        clientRequestId: 'req-confirm-1',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe('campaign_mission_started');
    expect(res.body.response ?? '').not.toMatch(/more detail to run that safely/i);
    expect(runCreateCampaignViaUnifiedDispatchMock).toHaveBeenCalled();
    expect(mockProcessIntake).not.toHaveBeenCalled();
  });

  it('returns cached response for duplicate confirm turns (idempotency guard)', async () => {
    setPendingIntakeConfirmation({
      actorKey: 'u:user-dup',
      tenantKey: 't:user-dup',
      storeId: 'store-1',
      tool: 'create_campaign',
      originalGoal: 'launch brunch promo',
    });

    const app = makeApp({ id: 'user-dup', business: undefined });
    const payload = {
      userMessage: 'confirm',
      currentContext: { activeStoreId: 'store-1' },
      history: [
        { role: 'user', content: 'launch brunch promo' },
        { role: 'assistant', content: 'Please confirm before proceeding: create_campaign' },
      ],
      clientRequestId: 'req-dup-1',
    };

    const first = await request(app).post('/api/performer/intake/v2').send(payload);
    const second = await request(app).post('/api/performer/intake/v2').send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(runCreateCampaignViaUnifiedDispatchMock).toHaveBeenCalledTimes(1);
  });
});
