/**
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findManyMock = vi.fn();

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: () => ({
    business: {
      findMany: findManyMock,
    },
  }),
}));

import storefrontRoutes from '../storefrontRoutes.js';

function makeApp() {
  const app = express();
  app.use('/api/storefront', storefrontRoutes);
  return app;
}

describe('GET /api/storefront/frontscreen', () => {
  beforeEach(() => {
    findManyMock.mockReset();
    findManyMock.mockResolvedValue([]);
  });

  // DANH: frontscreen-500-fix
  it('GET /frontscreen?limit=50 returns 200', async () => {
    const res = await request(makeApp()).get('/api/storefront/frontscreen?limit=50').expect(200);

    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.stores)).toBe(true);
    expect(findManyMock).toHaveBeenCalledTimes(1);
    const select = findManyMock.mock.calls[0][0]?.select ?? {};
    expect(select.transactionMode).toBeUndefined();
    expect(select.catalogLabel).toBeUndefined();
    expect(select.ctaLabel).toBeUndefined();
  });
});
