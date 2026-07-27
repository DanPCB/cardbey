/**
 * Intake V2 — reactPlanner confirm → approval_required for approval-gated tools.
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatchToolMock, mockProcessIntake } = vi.hoisted(() => ({
  dispatchToolMock: vi.fn(async () => ({
    status: 'ok',
    output: { message: 'Promotion created.' },
  })),
  mockProcessIntake: vi.fn(async () => ({
    executionPath: 'proactive_plan',
    tool: 'create_promotion',
    confidence: 0.92,
    parameters: { storeId: 'store-promo-1' },
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

vi.mock('../../lib/toolDispatcher.js', () => ({
  dispatchTool: (...args) => dispatchToolMock(...args),
}));

import performerIntakeV2Routes from '../performerIntakeV2Routes.js';
import {
  getIntakeApprovalPreview,
  clearIntakeApprovalPreviewStoreForTests,
} from '../../lib/intake/intakeApprovalPreviewStore.js';

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

describe('Intake V2 reactPlanner confirm → approval_required', () => {
  beforeEach(() => {
    clearIntakeApprovalPreviewStoreForTests();
    dispatchToolMock.mockClear();
    process.env.ENABLE_REACT_PLANNER_POST_CLASSIFY = 'true';
  });

  afterEach(() => {
    clearIntakeApprovalPreviewStoreForTests();
    delete process.env.ENABLE_REACT_PLANNER_POST_CLASSIFY;
  });

  it('returns approval_required for create_promotion (reactPlanner confirm) without dispatching', async () => {
    const app = makeApp({ id: 'user-promo', business: undefined });
    const res = await request(app)
      .post('/api/performer/intake/v2')
      .send({
        text: 'create a promotion for my spring sale',
        currentContext: { activeStoreId: 'store-promo-1' },
        history: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe('approval_required');
    expect(res.body.tool).toBe('create_promotion');
    expect(res.body.approval?.previewId).toBeTruthy();
    expect(dispatchToolMock).not.toHaveBeenCalled();

    const stored = getIntakeApprovalPreview(res.body.approval.previewId);
    expect(stored?.tool).toBe('create_promotion');
    expect(stored?.executionParameters?.storeId).toBe('store-promo-1');
  });
});
