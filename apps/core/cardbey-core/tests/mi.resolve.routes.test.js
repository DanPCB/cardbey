/**
 * POST /api/mi/resolve compatibility route
 * Ensures the endpoint returns non-404 (200/400/501) with JSON so dashboard flow does not break.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';

const testRequest = request(app);

describe('POST /api/mi/resolve', () => {
  it('returns non-404 with JSON content-type (200, 400, or 501 allowed)', async () => {
    const res = await testRequest
      .post('/api/mi/resolve')
      .set('Content-Type', 'application/json')
      .send({ objectId: 'test', context: { surface: 'dashboard' } });

    expect(res.status).not.toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toBeDefined();
    expect(typeof res.body).toBe('object');
  });

  it('returns 200 with ok: true and minimal intent/renderHints (no 501)', async () => {
    const res = await testRequest
      .post('/api/mi/resolve')
      .set('Content-Type', 'application/json')
      .send({ objectId: 'test', context: { surface: 'dashboard' } });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.renderHints).toBeDefined();
    expect(res.body.intent).toBeDefined();
    expect(Array.isArray(res.body.actions)).toBe(true);
  });
});
