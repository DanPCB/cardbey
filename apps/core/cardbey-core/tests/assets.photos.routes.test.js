/**
 * GET /api/assets/photos — stable response shape for dashboard Assets panel.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';

const testRequest = request(app);

describe('GET /api/assets/photos', () => {
  it('returns 200 with stable shape: ok, items, total, page, perPage', async () => {
    const res = await testRequest
      .get('/api/assets/photos?q=roses&page=1&perPage=24')
      .expect(200);

    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.ok).toBe(true);
    expect(res.body.provider).toBe('pexels');
    expect(res.body.query).toBeDefined();
    expect(typeof res.body.page).toBe('number');
    expect(typeof res.body.perPage).toBe('number');
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('returns items with id, thumbUrl, fullUrl, tags for query=roses', async () => {
    const res = await testRequest
      .get('/api/assets/photos?q=roses&page=1&perPage=24')
      .expect(200);

    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    const first = res.body.items[0];
    expect(first.id).toBeDefined();
    expect(first.thumbUrl).toBeDefined();
    expect(first.fullUrl).toBeDefined();
    expect(Array.isArray(first.tags)).toBe(true);
    expect(first.tags.some((t) => /rose|flower/i.test(t))).toBe(true);
  });

  it('returns items for queries cars, fishes, houses', async () => {
    for (const query of ['cars', 'fishes', 'houses']) {
      const res = await testRequest
        .get(`/api/assets/photos?q=${query}&page=1&perPage=24`)
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    }
  });
});
