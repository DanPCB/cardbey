import { describe, it, expect, vi, beforeEach } from 'vitest';
import hybridRouter from '../../src/lib/routing/hybridRouter.js';
import {
  executePublishThroughHybridRouter,
  extractHybridFlagsFromPayload,
  HYBRID_UI_PUBLISH_ACTIONS,
} from '../../src/lib/routing/uiHybridPublishBridge.js';

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
  };
  return res;
}

describe('Unified Publish Paths', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts hybrid flags from ui-action payload', () => {
    const { hybridBody, operationPayload } = extractHybridFlagsFromPayload({
      storeId: 'store-1',
      _preferAgent: true,
      confirmed: true,
      _executeAfterReview: true,
    });
    expect(hybridBody._preferAgent).toBe(true);
    expect(hybridBody.confirmed).toBe(true);
    expect(operationPayload.storeId).toBe('store-1');
  });

  it('ui publish actions are registered for hybrid bridge', () => {
    expect(HYBRID_UI_PUBLISH_ACTIONS.has('publish_store')).toBe(true);
    expect(HYBRID_UI_PUBLISH_ACTIONS.has('publish_cardbey')).toBe(true);
  });

  it('returns review_complete when agent review has suggestions', async () => {
    vi.spyOn(hybridRouter, 'reviewWithAgent').mockResolvedValue({
      status: 'ok',
      approved: true,
      suggestions: ['Improve hero headline'],
      payload: { status: 'ok' },
    });

    const result = await executePublishThroughHybridRouter({
      action: 'publish_store',
      payload: { storeId: 'store-1', _preferAgent: true },
      userId: 'user-1',
      directExecute: vi.fn(),
    });

    expect(result.status).toBe('review_complete');
    expect(result.suggestions).toContain('Improve hero headline');
  });

  it('executes publish on direct hybrid path without agent', async () => {
    const directExecute = vi.fn().mockResolvedValue({ publishedStoreId: 's1', storefrontUrl: 'https://x.test' });

    const result = await executePublishThroughHybridRouter({
      action: 'publish_store',
      payload: { storeId: 'store-1', confirmed: true },
      userId: 'user-1',
      directExecute,
    });

    expect(directExecute).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.output?.publishedStoreId).toBe('s1');
  });

  it('agent-assisted publish executes after confirmed review', async () => {
    vi.spyOn(hybridRouter, 'reviewWithAgent').mockResolvedValue({
      status: 'ok',
      approved: true,
      suggestions: [],
      payload: { status: 'ok' },
    });

    const directExecute = vi.fn().mockResolvedValue({ publishedStoreId: 's1' });
    const result = await executePublishThroughHybridRouter({
      action: 'publish_cardbey',
      payload: {
        draftStoreId: 'draft-1',
        _preferAgent: true,
        confirmed: true,
        _executeAfterReview: true,
      },
      userId: 'user-1',
      directExecute,
    });

    expect(directExecute).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.agentAssisted).toBe(true);
  });
});

describe('DELETE Confirmation Required', () => {
  it('returns 428 without confirmation on direct delete path', async () => {
    const req = {
      body: {},
      path: '/api/products/p1',
      originalUrl: '/api/products/p1',
      method: 'DELETE',
      params: { id: 'p1' },
      user: { id: 'u1' },
    };
    const res = mockRes();
    let directCalled = false;

    await hybridRouter.route(
      req,
      res,
      async () => {
        directCalled = true;
        res.json({ ok: true, deleted: true });
      },
      { requireConfirmation: true, operation: 'delete_product' },
    );

    expect(directCalled).toBe(false);
    expect(res.statusCode).toBe(428);
    expect(res.body?.confirmationRequired).toBe(true);
  });

  it('executes delete when confirmed', async () => {
    const req = {
      body: { confirmed: true },
      path: '/api/docs/doc-1',
      originalUrl: '/api/docs/doc-1',
      method: 'DELETE',
      params: { id: 'doc-1' },
      user: { id: 'u1' },
    };
    const res = mockRes();

    await hybridRouter.route(
      req,
      res,
      async () => {
        res.json({ ok: true, deleted: true });
      },
      { requireConfirmation: true, operation: 'delete_document' },
    );

    expect(res.body?.deleted).toBe(true);
  });
});
