/**
 * Intake V2 — execution policy forces approval_required (RISK.DESTRUCTIVE) without registry approvalRequired.
 * Uses a scoped getToolEntry mock so orders_report is treated as destructive for this suite only.
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatchToolMock } = vi.hoisted(() => ({
  dispatchToolMock: vi.fn(async () => ({
    status: 'ok',
    output: { message: 'Policy approval path OK.' },
  })),
}));

vi.mock('../../middleware/guestAuth.js', () => ({
  requireUserOrGuest: (_req, _res, next) => next(),
}));

vi.mock('../../lib/intake/intakeClassifier.js', () => ({
  classifyIntent: vi.fn(async () => ({
    executionPath: 'direct_action',
    tool: 'orders_report',
    confidence: 0.95,
    parameters: { groupBy: 'day' },
  })),
  CONFIDENCE: { HIGH: 0.8, MEDIUM: 0.55, LOW: 0 },
  FALLBACK_CLARIFY: { clarifyOptions: [] },
}));

vi.mock('../../lib/toolDispatcher.js', () => ({
  dispatchTool: (...args) => dispatchToolMock(...args),
}));

vi.mock('../../lib/intake/intakeToolRegistry.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getToolEntry: (tool) => {
      const e = actual.getToolEntry(tool);
      if (tool === 'orders_report' && e) {
        return { ...e, riskLevel: actual.RISK.DESTRUCTIVE };
      }
      return e;
    },
  };
});

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

describe('Intake V2 policy-driven approval_required (destructive risk)', () => {
  beforeEach(() => {
    clearIntakeApprovalPreviewStoreForTests();
    dispatchToolMock.mockClear();
  });

  afterEach(() => {
    clearIntakeApprovalPreviewStoreForTests();
  });

  it('returns approval_required + stored preview (not immediate dispatch)', async () => {
    const app = makeApp({ id: 'user-policy', business: undefined });
    const res = await request(app)
      .post('/api/performer/intake/v2')
      .send({
        text: 'Sales by day',
        currentContext: { activeStoreId: 'store-policy-1' },
        history: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe('approval_required');
    expect(res.body.tool).toBe('orders_report');
    expect(res.body.approval?.previewId).toBeTruthy();
    expect(res.body.approval?.requiresConfirmation).toBe(true);
    expect(dispatchToolMock).not.toHaveBeenCalled();

    const stored = getIntakeApprovalPreview(res.body.approval.previewId);
    expect(stored?.tool).toBe('orders_report');
    expect(stored?.actorKey).toBe('u:user-policy');
  });

  it('confirm re-validates and dispatches only after explicit confirm', async () => {
    const app = makeApp({ id: 'user-policy', business: undefined });
    const intakeRes = await request(app)
      .post('/api/performer/intake/v2')
      .send({
        text: 'Sales by day',
        currentContext: { activeStoreId: 'store-policy-1' },
        history: [],
      });
    const previewId = intakeRes.body.approval.previewId;
    expect(previewId).toBeTruthy();

    const confirmRes = await request(app)
      .post('/api/performer/intake/v2/confirm')
      .send({
        previewId,
        currentContext: { activeStoreId: 'store-policy-1' },
      });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.success).toBe(true);
    expect(confirmRes.body.action).toBe('tool_call');
    expect(confirmRes.body.tool).toBe('orders_report');
    expect(dispatchToolMock).toHaveBeenCalledTimes(1);
    expect(getIntakeApprovalPreview(previewId)).toBeNull();
  });

  it('confirm returns 403 for wrong actor (preview scoped)', async () => {
    const appA = makeApp({ id: 'user-policy-a', business: undefined });
    const intakeRes = await request(appA)
      .post('/api/performer/intake/v2')
      .send({
        text: 'Sales by day',
        currentContext: { activeStoreId: 'store-policy-1' },
        history: [],
      });
    const previewId = intakeRes.body.approval.previewId;

    const appB = express();
    appB.use(express.json());
    appB.use((req, _res, next) => {
      req.user = { id: 'user-policy-b', business: undefined };
      next();
    });
    appB.use('/api/performer/intake/v2', performerIntakeV2Routes);

    const confirmRes = await request(appB)
      .post('/api/performer/intake/v2/confirm')
      .send({
        previewId,
        currentContext: { activeStoreId: 'store-policy-1' },
      });

    expect(confirmRes.status).toBe(403);
    expect(dispatchToolMock).not.toHaveBeenCalled();
  });
});
