/**
 * POST /api/auth/guest – minimal guest token (no DB user)
 * NODE_ENV=test must return 200 and ok=true.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';

describe('POST /api/auth/guest', () => {
  it('returns 200 and ok=true with token and user when NODE_ENV=test', async () => {
    const res = await request(app)
      .post('/api/auth/guest')
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(0);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBeDefined();
    expect(String(res.body.user.id).startsWith('guest_')).toBe(true);
    expect(res.body.user.role).toBe('guest');
  });
});
