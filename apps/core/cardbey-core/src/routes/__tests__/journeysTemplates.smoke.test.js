/**
 * Smoke: journeys router mounted contract (templates list public).
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    journeyTemplate: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../lib/prisma.js';
import journeysRoutes from '../journeys.routes.js';

function appWithJourneys() {
  const app = express();
  app.use('/api/journeys', journeysRoutes);
  return app;
}

describe('GET /api/journeys/templates', () => {
  beforeEach(() => {
    vi.mocked(prisma.journeyTemplate.findMany).mockReset();
  });

  it('returns 200 with templates array', async () => {
    vi.mocked(prisma.journeyTemplate.findMany).mockResolvedValue([
      {
        id: 'jt1',
        slug: 'welcome',
        title: 'Welcome',
        tags: '[]',
        createdAt: new Date(),
        steps: [],
      },
    ]);

    const res = await request(appWithJourneys()).get('/api/journeys/templates');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(Array.isArray(res.body.templates)).toBe(true);
    expect(res.body.templates).toHaveLength(1);
    expect(res.body.templates[0]).toMatchObject({ slug: 'welcome', title: 'Welcome' });
    expect(prisma.journeyTemplate.findMany).toHaveBeenCalled();
  });

  it('returns 200 with empty list when no templates', async () => {
    vi.mocked(prisma.journeyTemplate.findMany).mockResolvedValue([]);

    const res = await request(appWithJourneys()).get('/api/journeys/templates');

    expect(res.status).toBe(200);
    expect(res.body.templates).toEqual([]);
  });
});
