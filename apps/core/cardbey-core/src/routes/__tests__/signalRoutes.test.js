import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  userSignalPreferences: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
};

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { id: 'user-test', role: 'store_owner', email: 'test@example.com' };
    next();
  },
}));

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: () => prismaMock,
}));

import signalRoutes from '../signalRoutes.js';

describe('signalRoutes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/signals', signalRoutes);
  });

  it('GET /api/signals/status returns definitions and preferences', async () => {
    prismaMock.userSignalPreferences.findUnique.mockResolvedValue({
      enabledSignals: ['power_user'],
      disabledSignals: [],
      customThresholds: { trial_expiring: 5 },
    });

    const res = await request(app).get('/api/signals/status');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.definitions.power_user.name).toBe('Power User');
    expect(res.body.preferences.thresholds.trial_expiring).toBe(5);
  });

  it('POST /api/signals/preferences upserts user preferences', async () => {
    prismaMock.userSignalPreferences.findUnique.mockResolvedValue(null);
    prismaMock.userSignalPreferences.upsert.mockResolvedValue({
      userId: 'user-test',
      enabledSignals: [],
      disabledSignals: ['power_user'],
      customThresholds: {},
    });

    const res = await request(app)
      .post('/api/signals/preferences')
      .send({ disabledSignals: ['power_user'] });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prismaMock.userSignalPreferences.upsert).toHaveBeenCalledOnce();
  });
});
