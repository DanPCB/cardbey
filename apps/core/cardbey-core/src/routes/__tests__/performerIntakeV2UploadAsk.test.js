/**
 * Upload Ask — (Image attached) must not 500 after intent-engine image carrier fix (#322).
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockIntentIntegration, mockBarrier } = vi.hoisted(() => ({
  mockIntentIntegration: {
    processIntake: vi.fn(async () => ({
      executionPath: 'proactive_plan',
      tool: 'create_store',
      confidence: 1,
      parameters: {},
      _classificationSource: 'intent_reasoner',
    })),
  },
  mockBarrier: vi.fn(async () => ({
    status: 'awaiting_perception',
    streamId: 'stream-test',
    message: 'Processing your upload — perception is still running.',
    timing: { startedAt: new Date().toISOString(), totalMs: 1 },
  })),
}));

vi.mock('../../middleware/guestAuth.js', () => ({
  requireUserOrGuest: (req, _res, next) => {
    req.user = { id: 'user_upload_ask' };
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
  ocrExtractText: vi.fn(async () => ({ text: '', provider: 'mock' })),
}));

vi.mock('../../lib/kernel/ingress/intakeEvidenceBarrier.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    runIntakeEvidenceBarrier: (...args) => mockBarrier(...args),
  };
});

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
  persistBeliefDelta: vi.fn(async () => {}),
}));

import performerIntakeV2Routes from '../performerIntakeV2Routes.js';

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/performer/intake/v2', performerIntakeV2Routes);
  return app;
}

const IMAGE = `data:image/png;base64,${'A'.repeat(120)}`;

describe('POST /api/performer/intake/v2 — upload Ask (Image attached)', () => {
  beforeEach(() => {
    mockIntentIntegration.processIntake.mockClear();
    mockBarrier.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns upload Ask clarify (not 500) for imageDataUrl carrier', async () => {
    mockBarrier.mockResolvedValueOnce({
      status: 'ready',
      bundle: {
        streamId: 's1',
        evidenceView: { evidenceId: 'ev1' },
        perceptionFrame: {},
        snapshot: { ocrText: 'HP SERVICES' },
        timing: {},
        imageRef: IMAGE,
      },
      attachmentAnalysis: {
        artifactType: 'business_card',
        ocrText: 'HP SERVICES',
        confidence: 0.9,
      },
      imageContext: { extractedText: 'HP SERVICES', hasText: true, evidenceId: 'ev1' },
    });

    const response = await request(makeApp())
      .post('/api/performer/intake/v2')
      .set('x-session-id', 'session-upload-ask')
      .send({
        text: '(Image attached)',
        goal: '(Image attached)',
        userMessage: '(Image attached)',
        imageDataUrl: IMAGE,
        locale: 'en',
        source: 'performer',
        intentSourceContext: {
          cardExtraction: { businessName: 'HP SERVICES', location: 'Melbourne' },
          uploadedAssetPending: true,
        },
      });

    if (response.status >= 500) {
      // eslint-disable-next-line no-console
      console.error('upload ask 500 body', response.body);
    }
    expect(response.status).toBeLessThan(500);
    expect(response.status).toBe(200);
    expect(response.body.action).toBe('clarify');
    expect(response.body.executionPath).toBe('intake_upload_ask');
    expect(String(response.body.response ?? response.body.message ?? '')).toMatch(/upload|HP SERVICES|read/i);
    expect(mockIntentIntegration.processIntake).not.toHaveBeenCalled();
    expect(mockBarrier).not.toHaveBeenCalled();
  });

  it('returns upload Ask (not awaiting_perception) before barrier on attachment-only turn', async () => {
    const response = await request(makeApp())
      .post('/api/performer/intake/v2')
      .set('x-session-id', 'session-upload-perception')
      .send({
        text: '(Image attached)',
        goal: '(Image attached)',
        userMessage: '(Image attached)',
        imageDataUrl: IMAGE,
        locale: 'en',
      });

    expect(response.status).toBe(200);
    expect(response.body.action).toBe('clarify');
    expect(response.body.executionPath).toBe('intake_upload_ask');
    expect(mockBarrier).not.toHaveBeenCalled();
  });
});
