/**
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockProcessIntake, mockBarrier } = vi.hoisted(() => ({
  mockProcessIntake: vi.fn(async () => ({
    executionPath: 'chat',
    tool: 'general_chat',
    confidence: 0.4,
    parameters: {},
    _classificationSource: 'intent_reasoner',
  })),
  mockBarrier: vi.fn(async () => ({
    status: 'awaiting_perception',
    streamId: 'reality:session:test-await',
    message: 'Processing your upload — perception is still running.',
    timing: { startedAt: '2026-07-09T00:00:00.000Z', totalMs: 1 },
  })),
}));

vi.mock('../../middleware/guestAuth.js', () => ({
  requireUserOrGuest: (req, _res, next) => {
    req.user = { id: 'user_123' };
    next();
  },
}));

vi.mock('../../lib/intent/intentIntegration.js', () => ({
  getIntentIntegration: vi.fn(() => ({ processIntake: mockProcessIntake })),
  resetIntentIntegrationForTests: vi.fn(),
}));

vi.mock('../../lib/intent/campaignOrchestrationIntent.js', () => ({
  isCampaignOrchestrationIntent: vi.fn(() => false),
}));

vi.mock('../../lib/kernel/ingress/intakeEvidenceBarrier.js', () => ({
  runIntakeEvidenceBarrier: (...args) => mockBarrier(...args),
  buildAwaitingPerceptionIntakeResponse: (result) => ({
    success: true,
    action: 'awaiting_perception',
    runtimeState: 'awaiting_perception',
    executionPath: 'awaiting_perception',
    message: result.message,
    streamId: result.streamId,
    retryAfterMs: 500,
    timing: result.timing,
  }),
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

vi.mock('../../services/conversation/conversationIntakeBridge.js', () => ({
  bootstrapConversationForIntake: vi.fn(async () => ({ session: null, context: null, history: [] })),
  finalizeConversationIntakeResponse: vi.fn(async ({ payload }) => payload),
  attachConversationToMissionMetadata: vi.fn((metadata) => metadata),
}));

vi.mock('../../lib/intake/intakeTelemetry.js', () => ({
  emitIntakeV2Telemetry: vi.fn(async () => 'telemetry-log-id'),
}));

import performerIntakeV2Routes from '../performerIntakeV2Routes.js';

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/performer/intake/v2', performerIntakeV2Routes);
  return app;
}

describe('POST /api/performer/intake/v2 — awaiting_perception contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns canonical awaiting_perception envelope before classification', async () => {
    const response = await request(makeApp())
      .post('/api/performer/intake/v2')
      .send({
        userMessage: '(Image attached)',
        attachments: [{ type: 'image', url: 'https://example.com/flyer.png', name: 'flyer.png', mimeType: 'image/png' }],
        imageDataUrl: 'data:image/png;base64,abc',
      });

    expect(response.status).toBe(200);
    expect(response.body.action).toBe('awaiting_perception');
    expect(response.body.runtimeState).toBe('awaiting_perception');
    expect(response.body.executionPath).toBe('awaiting_perception');
    expect(response.body.retryAfterMs).toBe(500);
    expect(mockProcessIntake).not.toHaveBeenCalled();
  });
});
