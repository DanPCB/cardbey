/**
 * CORS preflight: hero upload and locale/dev headers must be allowed.
 */
import express from 'express';
import cors from 'cors';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CORS_API_ALLOWED_HEADERS, corsOptions } from '../cors.js';

describe('CORS API allowed headers', () => {
  it('includes x-local and x-locale for dashboard cross-origin uploads', () => {
    expect(CORS_API_ALLOWED_HEADERS).toEqual(
      expect.arrayContaining(['x-local', 'X-Local', 'x-locale', 'X-Locale']),
    );
  });
});

describe('OPTIONS /api/stores/:storeId/upload/hero preflight', () => {
  function appWithCors() {
    const app = express();
    app.use(cors(corsOptions));
    app.options('/api/stores/:storeId/upload/hero', (_req, res) => {
      res.sendStatus(204);
    });
    app.post('/api/stores/:storeId/upload/hero', (_req, res) => {
      res.json({ ok: true });
    });
    return app;
  }

  it('allows Access-Control-Request-Headers: x-local', async () => {
    const res = await request(appWithCors())
      .options('/api/stores/test/upload/hero')
      .set('Origin', 'https://cardbey.com')
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'x-local, authorization, content-type, x-locale',
      );

    expect(res.status).toBe(204);
    const allowed = String(res.headers['access-control-allow-headers'] || '').toLowerCase();
    expect(allowed).toContain('x-local');
    expect(allowed).toContain('x-locale');
  });
});
