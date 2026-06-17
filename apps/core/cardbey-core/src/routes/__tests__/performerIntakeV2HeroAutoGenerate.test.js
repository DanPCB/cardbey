/**
 * Intake V2 hero image: generation-ready messages route to edit_artifact (Pexels hero search path).
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/guestAuth.js', () => ({
  requireUserOrGuest: (_req, _res, next) => next(),
}));

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: vi.fn(() => ({
    draftStore: { findFirst: vi.fn(async () => null) },
  })),
}));

vi.mock('../../lib/intake/intakeClassifier.js', () => ({
  classifyIntent: vi.fn(async () => ({
    executionPath: 'chat',
    tool: 'general_chat',
    confidence: 0.35,
    parameters: {},
  })),
  isCampaignOrchestrationIntent: vi.fn(() => false),
  CONFIDENCE: { HIGH: 0.8, MEDIUM: 0.55, LOW: 0 },
  FALLBACK_CLARIFY: { clarifyOptions: [] },
}));

vi.mock('../../lib/toolDispatcher.js', () => ({
  dispatchTool: vi.fn(async (toolName, input = {}) => {
    if (toolName === 'edit_artifact') {
      const { getPrismaClient } = await import('../../lib/prisma.js');
      await getPrismaClient().draftStore.findFirst({ take: 1 });
      return {
        status: 'ok',
        output: {
          tool: 'edit_artifact',
          phase: 'image_search_results',
          artifactType: 'hero',
          message: 'Found 3 photos. Pick one to use as your hero image.',
          images: [
            {
              url: 'https://example.com/hero-a.jpg',
              thumb: 'https://example.com/hero-a.jpg',
              photographer: 'Test',
              licenseNote: 'Free to use (Pexels)',
            },
          ],
          searchQuery: typeof input?.instruction === 'string' ? input.instruction.slice(0, 80) : 'fashion',
        },
      };
    }
    return { status: 'failed', error: { message: 'test stub' } };
  }),
}));

vi.mock('../../lib/runtime/performerRuntime/performerRuntime.js', () => ({
  performerRuntime: {
    execute: vi.fn(async (req) => {
      const toolName = req?.payload?.toolName ?? '';
      const input = req?.payload?.input ?? {};
      const { dispatchTool } = await import('../../lib/toolDispatcher.js');
      const out = await dispatchTool(toolName, input);
      return { status: out.status === 'ok' ? 'ok' : 'failed', output: out.output, error: out.error };
    }),
  },
}));

import performerIntakeV2Routes from '../performerIntakeV2Routes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'user-hero-auto', business: { id: 'biz-1' } };
    next();
  });
  app.use('/api/performer/intake/v2', performerIntakeV2Routes);
  return app;
}

describe('POST /api/performer/intake/v2 hero auto-generate', () => {
  it('routes descriptive hero request through proactive_plan for edit_artifact', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/performer/intake/v2')
      .send({
        text: 'change hero image to fashion style photo',
        currentContext: { activeStoreId: 'store-hero-1' },
        history: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe('proactive_plan');
    expect(Array.isArray(res.body.plan)).toBe(true);
    expect(res.body.plan.some((s) => s.recommendedTool === 'edit_artifact')).toBe(true);
  });

  it('bare hero change returns proactive_plan for update_store_hero', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/performer/intake/v2')
      .send({
        text: 'change hero image',
        currentContext: { activeStoreId: 'store-hero-2' },
        history: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe('proactive_plan');
    expect(Array.isArray(res.body.plan)).toBe(true);
    expect(res.body.plan.some((s) => s.recommendedTool === 'update_store_hero')).toBe(true);
  });
});
