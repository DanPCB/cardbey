/**
 * Smoke tests for headless automation proof endpoint.
 * - 401 without auth (route exists and requires auth)
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';

const testRequest = request(app);

describe('POST /api/automation/store-from-input', () => {
  it('returns 401 without auth', async () => {
    const res = await testRequest
      .post('/api/automation/store-from-input')
      .set('Content-Type', 'application/json')
      .send({ businessName: 'Test Cafe', businessType: 'cafe', location: 'Melbourne' })
      .expect(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.message).toMatch(/auth|token|sign in/i);
  });
});
