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

vi.mock('../../lib/intake/intakeClassifier.js', () => ({
  classifyIntent: vi.fn(async () => ({
    executionPath: 'chat',
    tool: 'general_chat',
    confidence: 0.35,
    parameters: {},
  })),
  CONFIDENCE: { HIGH: 0.8, MEDIUM: 0.55, LOW: 0 },
  FALLBACK_CLARIFY: { clarifyOptions: [] },
}));

vi.mock('../../lib/toolDispatcher.js', () => ({
  dispatchTool: vi.fn(async (toolName, input = {}) => {
    if (toolName === 'edit_artifact') {
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
  it('routes descriptive hero request to edit_artifact tool_call', async () => {
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
    expect(res.body.action).toBe('tool_call');
    expect(res.body.tool).toBe('edit_artifact');
    expect(String(res.body.parameters?.instruction ?? '')).toMatch(/fashion/i);
    expect(Array.isArray(res.body.result?.images)).toBe(true);
    expect(res.body.result?.images?.length).toBeGreaterThan(0);
  });

  it('bare hero change still returns clarify chips', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/performer/intake/v2')
      .send({
        text: 'change hero image',
        currentContext: { activeStoreId: 'store-hero-2' },
        history: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('clarify');
    expect(Array.isArray(res.body.options)).toBe(true);
    expect(res.body.options.some((o) => o.tool === '__client_hero_upload__')).toBe(true);
  });
});
