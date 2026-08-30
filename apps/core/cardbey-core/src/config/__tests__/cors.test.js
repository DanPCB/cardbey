/**
 * CORS preflight: hero upload and locale/dev headers must be allowed.
 */
import express from 'express';
import cors from 'cors';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  CORS_API_ALLOWED_HEADERS,
  corsOptions,
  resolvePreflightAllowHeaders,
} from '../cors.js';

describe('CORS API allowed headers', () => {
  it('includes x-local and x-locale for dashboard cross-origin uploads', () => {
    expect(CORS_API_ALLOWED_HEADERS).toEqual(
      expect.arrayContaining(['x-local', 'X-Local', 'x-locale', 'X-Locale']),
    );
  });

  it('includes X-Session-ID for Performer intake continuity', () => {
    expect(CORS_API_ALLOWED_HEADERS).toEqual(
      expect.arrayContaining(['X-Session-ID', 'x-session-id']),
    );
  });

  it('includes x-performer-mode for automation/manual mode routing', () => {
    expect(CORS_API_ALLOWED_HEADERS).toEqual(
      expect.arrayContaining(['x-performer-mode', 'X-Performer-Mode']),
    );
  });

  it('includes X-Creator-Source for Creator Studio profile creation', () => {
    expect(CORS_API_ALLOWED_HEADERS).toContain('X-Creator-Source');
  });

  it('includes x-cardbey-runtime-authority for Creator Studio video uploads', () => {
    expect(CORS_API_ALLOWED_HEADERS).toEqual(
      expect.arrayContaining(['x-cardbey-runtime-authority', 'X-Cardbey-Runtime-Authority']),
    );
  });

  it('resolvePreflightAllowHeaders echoes requested headers when all are allowed', () => {
    const echoed = resolvePreflightAllowHeaders(
      'content-type, authorization, x-session-id, x-creator-source',
    );
    expect(echoed.toLowerCase()).toContain('x-session-id');
    expect(echoed.toLowerCase()).toContain('x-creator-source');
  });
});

describe('OPTIONS /api/draft-store/:draftId/upload/hero preflight', () => {
  function appWithCors() {
    const app = express();
    app.use(cors(corsOptions));
    app.options('/api/draft-store/:draftId/upload/hero', (_req, res) => {
      res.sendStatus(204);
    });
    return app;
  }

  it('allows x-local on draft-store hero upload preflight', async () => {
    const res = await request(appWithCors())
      .options('/api/draft-store/draft-1/upload/hero')
      .set('Origin', 'http://192.168.1.11:5174')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization, x-local');

    expect(res.status).toBe(204);
    const allowed = String(res.headers['access-control-allow-headers'] || '').toLowerCase();
    expect(allowed).toContain('x-local');
  });
});

describe('OPTIONS /api/performer/intake/v2 preflight (cardbey.com → core)', () => {
  function appWithCors() {
    const app = express();
    app.use(cors(corsOptions));
    app.options('/api/performer/intake/v2', (req, res) => {
      const allow = resolvePreflightAllowHeaders(req.get('Access-Control-Request-Headers'));
      res.setHeader('Access-Control-Allow-Headers', allow);
      res.sendStatus(204);
    });
    app.post('/api/performer/intake/v2', (_req, res) => {
      res.json({ success: true });
    });
    return app;
  }

  it('allows real Performer intake header set from https://cardbey.com', async () => {
    const res = await request(appWithCors())
      .options('/api/performer/intake/v2')
      .set('Origin', 'https://cardbey.com')
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'content-type, authorization, x-session-id, x-maintenance-token, x-performer-role, x-performer-mode',
      );

    expect(res.status).toBe(204);
    const allowed = String(res.headers['access-control-allow-headers'] || '').toLowerCase();
    expect(allowed).toContain('x-session-id');
    expect(allowed).toContain('x-maintenance-token');
    expect(allowed).toContain('x-performer-role');
    expect(allowed).toContain('x-performer-mode');
  });
});

describe('OPTIONS /api/performer/runtime/ui-action/upload-creator-video preflight', () => {
  function appWithCors() {
    const app = express();
    app.use(cors(corsOptions));
    app.options('/api/performer/runtime/ui-action/upload-creator-video', (req, res) => {
      const allow = resolvePreflightAllowHeaders(req.get('Access-Control-Request-Headers'));
      res.setHeader('Access-Control-Allow-Headers', allow);
      res.sendStatus(204);
    });
    app.post('/api/performer/runtime/ui-action/upload-creator-video', (_req, res) => {
      res.json({ ok: true });
    });
    return app;
  }

  it('allows x-cardbey-runtime-authority from https://cardbey.com', async () => {
    const res = await request(appWithCors())
      .options('/api/performer/runtime/ui-action/upload-creator-video')
      .set('Origin', 'https://cardbey.com')
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'content-type, authorization, x-cardbey-runtime-authority',
      );

    expect(res.status).toBe(204);
    const allowed = String(res.headers['access-control-allow-headers'] || '').toLowerCase();
    expect(allowed).toContain('x-cardbey-runtime-authority');
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
