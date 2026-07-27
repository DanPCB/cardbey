/**
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => {
    req.userId = 'user-1';
    req.user = { id: 'user-1', roles: [] };
    next();
  },
  optionalAuth: (_req, _res, next) => next(),
}));

vi.mock('../../services/draftStore/heroAssetUpload.js', () => ({
  heroAssetUploadSingle: (req, _res, next) => {
    req.file = {
      buffer: Buffer.from('fake'),
      mimetype: 'image/jpeg',
      originalname: 'hero.jpg',
    };
    next();
  },
  resolveDraftForHeroUpload: vi.fn(async () => ({
    draft: { id: 'draft-1', preview: {}, committedStoreId: null },
  })),
  executeHeroAssetUpload: vi.fn(async (_req, res) => {
    res.status(200).json({ ok: true, url: 'https://cdn.example.com/hero.jpg' });
  }),
}));

import draftStoreRoutes from '../draftStore.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/draft-store', draftStoreRoutes);
  return app;
}

describe('POST /api/draft-store/:draftId/upload/hero', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 when draft resolves', async () => {
    const res = await request(makeApp())
      .post('/api/draft-store/draft-1/upload/hero')
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.url).toContain('hero.jpg');
  });
});
