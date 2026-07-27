import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import layoutRoutes from '../layoutRoutes.js';

describe('layoutRoutes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/layout', layoutRoutes);

  it('GET /api/layout/types returns supported types', async () => {
    const res = await request(app).get('/api/layout/types');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.types).toContain('text');
    expect(res.body.types).toContain('menu');
  });

  it('POST /api/layout/apply formats content', async () => {
    const res = await request(app)
      .post('/api/layout/apply')
      .send({ content: 'COFFEE\nEspresso 3.50\nLatte 4.50', type: 'menu' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.type).toBe('menu');
    expect(res.body.processed).toContain('# MENU');
    expect(Array.isArray(res.body.suggestedActions)).toBe(true);
  });

  it('POST /api/layout/apply rejects missing content', async () => {
    const res = await request(app).post('/api/layout/apply').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/layout/apply rejects invalid type', async () => {
    const res = await request(app)
      .post('/api/layout/apply')
      .send({ content: 'hello', type: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
