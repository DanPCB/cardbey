import { describe, it, expect, vi, beforeEach } from 'vitest';
import hybridRouter from '../../src/lib/routing/hybridRouter.js';

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

describe('Hybrid Router — wired operations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses direct path when no agent requested', async () => {
    const req = {
      body: {},
      path: '/api/stores/publish',
      originalUrl: '/api/stores/publish',
      method: 'POST',
      params: {},
      user: { id: 'u1' },
    };
    const res = mockRes();
    let directCalled = false;

    await hybridRouter.route(req, res, async () => {
      directCalled = true;
      res.json({ ok: true, published: true });
    });

    expect(directCalled).toBe(true);
    expect(res.body).toEqual({ ok: true, published: true });
  });

  it('returns agent review payload when _preferAgent=true without confirmed', async () => {
    vi.spyOn(hybridRouter, 'reviewWithAgent').mockResolvedValue({
      status: 'ok',
      approved: true,
      suggestions: ['Check hero image before publish'],
      payload: { status: 'ok' },
      message: 'Review complete.',
    });

    const req = {
      body: { _preferAgent: true },
      path: '/api/stores/publish',
      originalUrl: '/api/stores/publish',
      method: 'POST',
      params: {},
      user: { id: 'u1' },
    };
    const res = mockRes();
    let directCalled = false;

    await hybridRouter.route(req, res, async () => {
      directCalled = true;
      res.json({ ok: true });
    });

    expect(directCalled).toBe(false);
    expect(res.body?.agentReviewed).toBe(true);
    expect(res.body?.suggestions).toContain('Check hero image before publish');
  });

  it('requires confirmation for delete on direct path', async () => {
    const req = {
      body: {},
      path: '/api/stores/store-1',
      originalUrl: '/api/stores/store-1',
      method: 'DELETE',
      params: { storeId: 'store-1' },
      user: { id: 'u1' },
    };
    const res = mockRes();
    let directCalled = false;

    await hybridRouter.route(
      req,
      res,
      async () => {
        directCalled = true;
        res.json({ ok: true, deleted: 'store-1' });
      },
      { requireConfirmation: true, operation: 'delete_store' },
    );

    expect(directCalled).toBe(false);
    expect(res.statusCode).toBe(428);
    expect(res.body?.confirmationRequired).toBe(true);
  });

  it('executes delete when confirmed on direct path', async () => {
    const req = {
      body: { confirmed: true },
      path: '/api/stores/store-1',
      originalUrl: '/api/stores/store-1',
      method: 'DELETE',
      params: { storeId: 'store-1' },
      user: { id: 'u1' },
    };
    const res = mockRes();
    let directCalled = false;

    await hybridRouter.route(
      req,
      res,
      async () => {
        directCalled = true;
        res.json({ ok: true, deleted: 'store-1' });
      },
      { requireConfirmation: true, operation: 'delete_store' },
    );

    expect(directCalled).toBe(true);
    expect(res.body?.deleted).toBe('store-1');
  });

  it('executes agent-assisted publish after review when confirmed', async () => {
    vi.spyOn(hybridRouter, 'reviewWithAgent').mockResolvedValue({
      status: 'ok',
      approved: true,
      suggestions: [],
      payload: { status: 'ok' },
    });

    const req = {
      body: { _preferAgent: true, confirmed: true, _executeAfterReview: true },
      path: '/api/draft-store/d1/publish',
      originalUrl: '/api/draft-store/d1/publish',
      method: 'POST',
      params: { draftId: 'd1' },
      user: { id: 'u1' },
    };
    const res = mockRes();

    await hybridRouter.route(
      req,
      res,
      async () => {
        res.json({ ok: true, publishedStoreId: 's1' });
      },
      { operation: 'publish_draft' },
    );

    expect(res.body?.agentAssisted).toBe(true);
    expect(res.body?.publishedStoreId).toBe('s1');
  });
});
