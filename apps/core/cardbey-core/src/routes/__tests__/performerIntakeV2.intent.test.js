/**
 * Phase 3 — Route-level Intent Reasoning integration tests.
 *
 * @vitest-environment node
 */

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockIntentIntegration } = vi.hoisted(() => ({
  mockIntentIntegration: {
    processIntake: vi.fn(async () => ({
      executionPath: 'chat',
      tool: 'general_chat',
      confidence: 0.5,
      parameters: {},
      _classificationSource: 'intent_reasoner',
    })),
  },
}));

vi.mock('../../middleware/guestAuth.js', () => ({
  requireUserOrGuest: (req, _res, next) => {
    req.user = { id: 'user_123' };
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

import performerIntakeV2Routes from '../performerIntakeV2Routes.js';
import { getIntentIntegration } from '../../lib/intent/intentIntegration.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/performer/intake/v2', performerIntakeV2Routes);
  return app;
}

describe('POST /api/performer/intake/v2 — unified Intent Reasoning', () => {
  beforeEach(() => {
    mockIntentIntegration.processIntake.mockResolvedValue({
      executionPath: 'chat',
      tool: 'general_chat',
      confidence: 0.5,
      parameters: {},
      _classificationSource: 'intent_reasoner',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('always uses Intent Reasoning for automation mode', async () => {
    const response = await request(makeApp())
      .post('/api/performer/intake/v2')
      .send({ text: 'Add a product' });

    expect(response.status).toBe(200);
    expect(mockIntentIntegration.processIntake).toHaveBeenCalled();
    expect(getIntentIntegration).toHaveBeenCalled();
  });

  it('passes shortcutContext when create-store shortcut is detected', async () => {
    await request(makeApp())
      .post('/api/performer/intake/v2')
      .send({
        text: 'Create store',
        primaryMode: 'create',
        intentSource: 'frontscreen',
      });

    expect(mockIntentIntegration.processIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          shortcutContext: expect.objectContaining({ type: 'create_store' }),
        }),
      }),
    );
  });

  it('returns 500 when IntentReasoner fails', async () => {
    mockIntentIntegration.processIntake.mockRejectedValue(
      new Error('IntentReasoner failed: Test error'),
    );

    const response = await request(makeApp())
      .post('/api/performer/intake/v2')
      .send({ text: 'Test' });

    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Reasoning failed');
    expect(response.body.error).toContain('IntentReasoner failed');
  });
});
