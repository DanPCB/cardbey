import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  attachRequestResponseState,
  markRequestTimedOut,
  requestResponseStateMiddleware,
  safeJson,
} from '../requestResponseState.js';
import { latencyGuard } from '../latencyGuard.js';

describe('requestResponseState', () => {
  it('safeJson sends exactly once', () => {
    const app = express();
    app.get('/once', (req, res) => {
      requestResponseStateMiddleware(req, res, () => {
        expect(safeJson(res, 200, { ok: true }, req)).toBe(true);
        expect(safeJson(res, 200, { ok: false }, req)).toBe(false);
        res.end();
      });
    });
    return request(app).get('/once').expect(200).expect({ ok: true });
  });

  it('late handler completion sends no second response after timeout', async () => {
    process.env.API_REQUEST_TIMEOUT_MS = '30';
    const app = express();
    app.use(requestResponseStateMiddleware);
    app.use(latencyGuard);
    app.get('/slow', async (req, res) => {
      attachRequestResponseState(req);
      await new Promise((r) => setTimeout(r, 80));
      if (req.isRequestAborted?.()) return;
      safeJson(res, 200, { ok: true }, req);
    });

    const res = await request(app).get('/slow').expect(408);
    expect(res.body.error).toBe('request_timeout');
    delete process.env.API_REQUEST_TIMEOUT_MS;
  });

  it('markRequestTimedOut aborts downstream signal', () => {
    const req = { requestId: 't1' };
    attachRequestResponseState(req);
    markRequestTimedOut(req);
    expect(req.abortSignal?.aborted).toBe(true);
    expect(req.isTimedOut()).toBe(true);
  });
});
