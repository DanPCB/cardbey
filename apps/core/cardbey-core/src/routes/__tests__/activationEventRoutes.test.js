import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const recordMock = vi.fn();

vi.mock('../../services/activation/activationEvents.js', () => ({
  recordActivationEvent: (...args) => recordMock(...args),
}));

import activationEventRoutes from '../public/activationEventRoutes.js';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/public/activation', activationEventRoutes);
  return a;
}

describe('POST /api/public/activation/events', () => {
  beforeEach(() => {
    recordMock.mockReset();
    recordMock.mockResolvedValue({ ok: true, recorded: true });
  });

  it('records allowlisted fields only', async () => {
    const res = await request(app())
      .post('/api/public/activation/events')
      .send({
        eventType: 'QUICK_START_VIEWED',
        capability: 'miniweb',
        email: 'secret@example.com',
        anonymousId: 'v1',
      });
    expect(res.status).toBe(200);
    expect(res.body.recorded).toBe(true);
    expect(recordMock.mock.calls[0][0].email).toBeUndefined();
    expect(recordMock.mock.calls[0][0].eventType).toBe('QUICK_START_VIEWED');
  });
});
