import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { id: 'user-test', role: 'owner' };
    next();
  },
}));

const getStatus = vi.fn(async () => ({
  twitter: { connected: false, status: 'not_connected', message: 'Not connected' },
}));

const connectPlatform = vi.fn(async () => ({ ok: true, status: 'connected', platform: 'telegram' }));
const disconnectPlatform = vi.fn(async () => ({ ok: true, status: 'disconnected', platform: 'telegram' }));

vi.mock('../../services/platforms/platformService.js', () => ({
  default: {
    listRegistry: () => ({ social: [], llm: [] }),
    getStatus: (...args) => getStatus(...args),
    connectPlatform: (...args) => connectPlatform(...args),
    disconnectPlatform: (...args) => disconnectPlatform(...args),
    checkPlatformStatus: vi.fn(),
  },
}));

describe('platformRoutes', () => {
  let app;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { default: platformRoutes } = await import('../../routes/platformRoutes.js');
    app = express();
    app.use(express.json());
    app.use('/api/platforms', platformRoutes);
  });

  it('GET /status returns platform map', async () => {
    const res = await request(app).get('/api/platforms/status');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.platforms.twitter).toBeTruthy();
    expect(getStatus).toHaveBeenCalledWith('user-test');
  });

  it('POST /:platformId/connect delegates to service', async () => {
    const res = await request(app)
      .post('/api/platforms/telegram/connect')
      .send({ TELEGRAM_BOT_TOKEN: '123:abc' });
    expect(res.status).toBe(200);
    expect(connectPlatform).toHaveBeenCalledWith('user-test', 'telegram', {
      TELEGRAM_BOT_TOKEN: '123:abc',
    });
  });

  it('POST /:platformId/disconnect delegates to service', async () => {
    const res = await request(app).post('/api/platforms/telegram/disconnect');
    expect(res.status).toBe(200);
    expect(disconnectPlatform).toHaveBeenCalledWith('user-test', 'telegram');
  });
});
