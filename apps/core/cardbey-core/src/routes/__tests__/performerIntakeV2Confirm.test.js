/**
 * Intake V2 POST /confirm — preview lookup, actor match, re-validation, dispatch.
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { unifiedDispatchMock } = vi.hoisted(() => {
  const unifiedDispatchMock = vi.fn(async (action) => ({
    ok: true,
    status: 'ok',
    tool: action?.type ?? 'orders_report',
    toolResult: { status: 'ok', output: { message: 'Tool finished.' } },
    payload: { ...(action?.payload?.input ?? {}), missionId: action?.payload?.missionId ?? null },
  }));
  return { unifiedDispatchMock };
});

vi.mock('../../middleware/guestAuth.js', () => ({
  requireUserOrGuest: (_req, _res, next) => next(),
}));

/** Avoid loading LLM stack when importing the full intake router. */
vi.mock('../../lib/intent/campaignOrchestrationIntent.js', () => ({
  isCampaignOrchestrationIntent: vi.fn(() => false),
}));

vi.mock('../../lib/intake/unifiedDispatch.js', () => ({
  unifiedDispatch: (...args) => unifiedDispatchMock(...args),
  mapUnifiedDispatchToIntakeResponse: (result, ctx = {}) => ({
    success: result.ok !== false,
    action: 'tool_call',
    tool: result.tool ?? ctx.tool ?? null,
    parameters: result.payload ?? {},
    response: result.toolResult?.output?.message ?? 'Tool finished.',
    result: result.toolResult?.output ?? null,
    artifacts: result.toolResult?.output?.artifacts ?? [],
    executionPath: 'proactive_plan',
    missionId: result.payload?.missionId ?? null,
  }),
}));

import performerIntakeV2Routes from '../performerIntakeV2Routes.js';
import {
  putIntakeApprovalPreview,
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

describe('POST /api/performer/intake/v2/confirm', () => {
  beforeEach(() => {
    clearIntakeApprovalPreviewStoreForTests();
    unifiedDispatchMock.mockClear();
  });

  afterEach(() => {
    clearIntakeApprovalPreviewStoreForTests();
  });

  it('executes tool when preview is valid and actor matches', async () => {
    putIntakeApprovalPreview({
      previewId: 'pv-ok',
      tool: 'orders_report',
      executionParameters: { groupBy: 'day' },
      actorKey: 'u:user-a',
      tenantKey: 't:user-a',
      resolvedStoreIdAtPreview: 'store-1',
    });

    const app = makeApp({ id: 'user-a', business: undefined });
    const res = await request(app)
      .post('/api/performer/intake/v2/confirm')
      .send({
        previewId: 'pv-ok',
        currentContext: { activeStoreId: 'store-1' },
      });

    expect(res.status).toBe(200);
    expect(res.headers['x-cardbey-trace-id']).toMatch(/^[a-zA-Z0-9_.:-]{8,128}$/);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe('tool_call');
    expect(res.body.tool).toBe('orders_report');
    expect(unifiedDispatchMock).toHaveBeenCalled();
    const [action, options] = unifiedDispatchMock.mock.calls[0];
    expect(action.type).toBe('orders_report');
    expect(action.payload.input.storeId).toBe('store-1');
    expect(options.confirmed).toBe(true);
    expect(options.source).toBe('intake_v2_confirm');
  });

  it('rejects expired preview', async () => {
    vi.useFakeTimers();
    putIntakeApprovalPreview({
      previewId: 'pv-old',
      tool: 'orders_report',
      executionParameters: { groupBy: 'day' },
      actorKey: 'u:user-a',
      tenantKey: 't:user-a',
      resolvedStoreIdAtPreview: 'store-1',
    });
    vi.advanceTimersByTime(10 * 60 * 1000);

    const app = makeApp({ id: 'user-a', business: undefined });
    const res = await request(app)
      .post('/api/performer/intake/v2/confirm')
      .send({ previewId: 'pv-old', currentContext: { activeStoreId: 'store-1' } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('expired_or_missing');
    expect(unifiedDispatchMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('returns 403 when actor does not match preview', async () => {
    putIntakeApprovalPreview({
      previewId: 'pv-other',
      tool: 'orders_report',
      executionParameters: { groupBy: 'day' },
      actorKey: 'u:user-a',
      tenantKey: 't:user-a',
      resolvedStoreIdAtPreview: 'store-1',
    });

    const app = makeApp({ id: 'user-b', business: undefined });
    const res = await request(app)
      .post('/api/performer/intake/v2/confirm')
      .send({ previewId: 'pv-other', currentContext: { activeStoreId: 'store-1' } });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(unifiedDispatchMock).not.toHaveBeenCalled();
  });

  it('confirms device.sendInput without active store context', async () => {
    putIntakeApprovalPreview({
      previewId: 'pv-device',
      tool: 'device.sendInput',
      executionParameters: {
        task: 'open Notepad and type hello from Cardbey',
      },
      actorKey: 'u:user-a',
      tenantKey: 't:user-a',
      resolvedStoreIdAtPreview: 'store-1',
    });

    const app = makeApp({ id: 'user-a', business: undefined });
    const res = await request(app)
      .post('/api/performer/intake/v2/confirm')
      .send({
        previewId: 'pv-device',
        currentContext: { activeStoreId: 'store-1' },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe('tool_call');
    expect(res.body.tool).toBe('device.sendInput');
    expect(unifiedDispatchMock).toHaveBeenCalled();
    const [action] = unifiedDispatchMock.mock.calls[0];
    expect(action.type).toBe('device.sendInput');
    expect(action.payload.input.task).toMatch(/Notepad/i);
    expect(action.payload.input.storeId).toBeUndefined();
  });

  it('blocks confirm when re-validation fails (missing store)', async () => {
    putIntakeApprovalPreview({
      previewId: 'pv-nostore',
      tool: 'orders_report',
      executionParameters: { groupBy: 'day' },
      actorKey: 'u:user-a',
      tenantKey: 't:user-a',
      resolvedStoreIdAtPreview: null,
    });

    const app = makeApp({ id: 'user-a', business: undefined });
    const res = await request(app)
      .post('/api/performer/intake/v2/confirm')
      .send({ previewId: 'pv-nostore', currentContext: {} });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.action).toBe('clarify');
    expect(unifiedDispatchMock).not.toHaveBeenCalled();
  });

  it('echoes X-Cardbey-Trace-Id when client sends a valid value', async () => {
    putIntakeApprovalPreview({
      previewId: 'pv-trace',
      tool: 'orders_report',
      executionParameters: { groupBy: 'day' },
      actorKey: 'u:user-a',
      tenantKey: 't:user-a',
      resolvedStoreIdAtPreview: 'store-1',
    });

    const app = makeApp({ id: 'user-a', business: undefined });
    const res = await request(app)
      .post('/api/performer/intake/v2/confirm')
      .set('X-Cardbey-Trace-Id', 'client-correlation-99')
      .send({
        previewId: 'pv-trace',
        currentContext: { activeStoreId: 'store-1' },
      });

    expect(res.status).toBe(200);
    expect(res.headers['x-cardbey-trace-id']).toBe('client-correlation-99');
  });
});
