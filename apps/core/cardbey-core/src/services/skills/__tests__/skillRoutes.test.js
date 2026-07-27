import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { id: 'user-test', role: 'store_owner' };
    next();
  },
}));

vi.mock('../index.js', () => ({
  executeComposableSkill: vi.fn(async (skillId, context) => ({
    skill: skillId,
    version: '1.0.0',
    output: { success: true, data: context },
  })),
}));

import composableSkillRegistry from '../skillRegistry.js';
import skillRoutes from '../../../routes/skillRoutes.js';
import { executeComposableSkill } from '../index.js';

describe('skillRoutes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    composableSkillRegistry.resetForTests();
    composableSkillRegistry.register({
      id: 'analyze_store',
      version: '1.0.0',
      name: 'Analyze Store',
      category: 'analysis',
      tags: ['store'],
      capabilities: ['analyze'],
    });

    app = express();
    app.use(express.json());
    app.use('/api/skills', skillRoutes);
  });

  it('GET /api/skills/list returns registered skills', async () => {
    const res = await request(app).get('/api/skills/list');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.skills.some((s) => s.id === 'analyze_store')).toBe(true);
  });

  it('POST /api/skills/execute runs composable skill', async () => {
    const res = await request(app)
      .post('/api/skills/execute')
      .send({ skillId: 'analyze_store', context: { storeId: 'store-1' } });

    expect(res.status).toBe(200);
    expect(executeComposableSkill).toHaveBeenCalledWith(
      'analyze_store',
      expect.objectContaining({
        storeId: 'store-1',
        userId: 'user-test',
        runtimeOwned: true,
      }),
      expect.objectContaining({}),
    );
    expect(res.body.ok).toBe(true);
  });
});
