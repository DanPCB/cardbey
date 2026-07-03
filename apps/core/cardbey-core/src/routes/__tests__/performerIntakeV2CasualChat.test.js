/**
 * Casual greetings must short-circuit before create-store classification.
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockIntentIntegration } = vi.hoisted(() => ({
  mockIntentIntegration: {
    processIntake: vi.fn(async () => ({
      executionPath: 'proactive_plan',
      tool: 'create_store',
      confidence: 1,
      parameters: {},
      _classificationSource: 'intent_reasoner',
    })),
  },
}));

vi.mock('../../middleware/guestAuth.js', () => ({
  requireUserOrGuest: (req, _res, next) => {
    req.user = { id: 'user_casual' };
    next();
  },
}));

vi.mock('../../lib/intent/intentIntegration.js', () => ({
  getIntentIntegration: vi.fn(() => mockIntentIntegration),
  resetIntentIntegrationForTests: vi.fn(),
}));

vi.mock('../../lib/intent/campaignOrchestrationIntent.js', () => ({
  isCampaignOrchestrationIntent: vi.fn(() => false),
}));

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: vi.fn(() => ({
    business: { findMany: vi.fn(async () => []) },
    missionPipeline: {
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    },
  })),
}));

vi.mock('../../lib/ocr/ocrProvider.js', () => ({
  ocrExtractText: vi.fn(async () => ''),
}));

vi.mock('../../services/conversation/conversationIntakeBridge.js', () => ({
  bootstrapConversationForIntake: vi.fn(async () => ({ session: null, context: null, history: [] })),
  finalizeConversationIntakeResponse: vi.fn(async (_req, res, payload) => payload),
  attachConversationToMissionMetadata: vi.fn((metadata) => metadata),
}));

vi.mock('../../lib/intake/intakeTelemetry.js', () => ({
  emitIntakeV2Telemetry: vi.fn(async () => 'telemetry-log-id'),
}));

vi.mock('../../lib/decision/persistBeliefDelta.js', () => ({
  clearStaleUploadBeliefContext: vi.fn(async () => {}),
}));

import performerIntakeV2Routes from '../performerIntakeV2Routes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/performer/intake/v2', performerIntakeV2Routes);
  return app;
}

describe('POST /api/performer/intake/v2 — casual chat shortcircuit', () => {
  beforeEach(() => {
    mockIntentIntegration.processIntake.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns chat for hi even with stale store_setup primaryModeHint', async () => {
    const response = await request(makeApp())
      .post('/api/performer/intake/v2')
      .set('x-session-id', 'session-casual-hi')
      .send({
        text: 'hi',
        primaryModeHint: 'store_setup',
        intentSource: 'business_entry',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      action: 'chat',
      executionPath: 'direct_action',
    });
    expect(response.body.response).toMatch(/how can i help/i);
    expect(mockIntentIntegration.processIntake).not.toHaveBeenCalled();
  });

  it('still routes explicit create store through intent reasoning', async () => {
    const response = await request(makeApp())
      .post('/api/performer/intake/v2')
      .send({ text: 'Create store', primaryMode: 'create' });

    expect(response.status).toBe(200);
    expect(mockIntentIntegration.processIntake).toHaveBeenCalled();
    expect(response.body.action).not.toBe('chat');
  });
});
