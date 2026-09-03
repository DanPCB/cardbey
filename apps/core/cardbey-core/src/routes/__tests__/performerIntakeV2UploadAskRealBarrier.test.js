/**
 * Upload Ask — real evidence barrier (OCR mocked).
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/guestAuth.js', () => ({
  requireUserOrGuest: (req, _res, next) => {
    req.user = { id: 'user_upload_ask_real' };
    next();
  },
}));

vi.mock('../../lib/intent/intentIntegration.js', () => ({
  getIntentIntegration: vi.fn(() => ({
    processIntake: vi.fn(async () => ({
      executionPath: 'chat',
      tool: 'general_chat',
      confidence: 1,
      parameters: {},
    })),
  })),
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
  ocrExtractText: vi.fn(async () => ({ text: 'HP SERVICES', provider: 'mock' })),
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
  persistBeliefDelta: vi.fn(async () => {}),
}));

import performerIntakeV2Routes from '../performerIntakeV2Routes.js';

const IMAGE = `data:image/png;base64,${'A'.repeat(120)}`;

describe('POST /api/performer/intake/v2 — upload Ask real barrier', () => {
  it('returns upload Ask before real barrier on attachment-only turn', async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/api/performer/intake/v2', performerIntakeV2Routes);

    const response = await request(app)
      .post('/api/performer/intake/v2')
      .set('x-session-id', 'session-real-barrier')
      .send({
        text: '(Image attached)',
        goal: '(Image attached)',
        userMessage: '(Image attached)',
        imageDataUrl: IMAGE,
        locale: 'en',
        intentSourceContext: {
          cardExtraction: { businessName: 'HP SERVICES' },
          uploadedAssetPending: true,
        },
      });

    if (response.status >= 500) {
      // eslint-disable-next-line no-console
      console.error('REAL BARRIER 500', response.status, response.body);
    }
    expect(response.status).toBe(200);
    expect(response.body.action).toBe('clarify');
    expect(response.body.executionPath).toBe('intake_upload_ask');
  }, 30_000);
});
