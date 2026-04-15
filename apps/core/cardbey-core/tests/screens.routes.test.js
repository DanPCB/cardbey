import { beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import supertest from 'supertest';

import { screensRouter } from '../src/screens/routes.js';
import {
  resetStoresForTest,
  consumePairCode,
  createScreen,
} from '../src/screens/store.js';
import {
  resetPendingStoreForTest,
  resolvePendingByCode,
} from '../src/screens/pendingStore.js';

const app = express();
app.use(express.json());
app.use('/api/screens', screensRouter);
app.post('/api/devices/pair', (req, res) => {
  const { code, name, location } = req.body || {};
  const normalized = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!normalized) {
    return res.status(400).json({ ok: false, error: 'CODE_REQUIRED' });
  }
  if (!/^[A-Z0-9]{6}$/.test(normalized)) {
    return res.status(400).json({ ok: false, error: 'INVALID_CODE_FORMAT' });
  }
  const consumed = consumePairCode(normalized);
  if (!consumed) {
    return res
      .status(404)
      .json({ ok: false, error: 'INVALID_OR_EXPIRED_CODE' });
  }
  const screen = createScreen({
    id: `dev_${normalized.toLowerCase()}`,
    name: typeof name === 'string' && name.trim() ? name.trim() : undefined,
  });
  if (typeof location === 'string' && location.trim()) {
    screen.meta = { ...(screen.meta || {}), location: location.trim() };
  }
  resolvePendingByCode(normalized);
  return res.status(201).json({
    ok: true,
    deviceId: screen.id,
    screenId: screen.id,
    token: `t_${normalized}`,
  });
});

const request = supertest(app);

describe('Core screens routes', () => {
  beforeEach(() => {
    resetStoresForTest();
    resetPendingStoreForTest();
  });

  it('upserts heartbeat and returns screen listing sorted by updatedAt', async () => {
    const resHeartbeat = await request
      .post('/api/screens/alpha/heartbeat')
      .send({ meta: { version: '1.0.0' } })
      .expect(200);

    expect(resHeartbeat.body.ok).toBe(true);
    expect(resHeartbeat.body.online).toBe(true);

    // Create another screen and update alpha again so it appears first by updatedAt.
    await request.post('/api/screens/bravo/heartbeat').expect(200);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await request.post('/api/screens/alpha/heartbeat').expect(200);

    const listRes = await request.get('/api/screens').expect(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBe(2);
    expect(listRes.body[0].id).toBe('alpha');
    expect(listRes.body[0].online).toBe(true);
  });

  it('returns 204 for missing playlist and supports ETag flow when present', async () => {
    await request.get('/api/screens/nope/playlist').expect(204);

    const playlist = [
      { type: 'video', url: 'https://cdn.example.com/video.mp4', duration: 30 },
      { url: 'https://cdn.example.com/image.jpg' },
    ];

    const saveRes = await request
      .post('/api/screens/nope/playlist')
      .send({ items: playlist })
      .expect(200);

    expect(saveRes.body.ok).toBe(true);
    expect(saveRes.body.count).toBe(2);

    const getRes = await request.get('/api/screens/nope/playlist').expect(200);
    expect(getRes.body.ok).toBe(true);
    expect(getRes.body.items.length).toBe(2);
    expect(Boolean(getRes.headers.etag)).toBe(true);

    await request
      .get('/api/screens/nope/playlist')
      .set('If-None-Match', getRes.headers.etag)
      .expect(304);
  });

  it('validates playlist payloads', async () => {
    const res = await request
      .post('/api/screens/test/playlist')
      .send({ items: 'not-an-array' })
      .expect(400);

    expect(res.body.ok).toBe(false);
  });

  it('deletes screens safely even when missing', async () => {
    await request.post('/api/screens/live/heartbeat').expect(200);
    await request.delete('/api/screens/live').expect(200, { ok: true });
    await request.delete('/api/screens/missing').expect(200, { ok: true });
  });

  it('generates pairing codes without creating screens and exposes peek status', async () => {
    const startRes = await request.post('/api/screens/pair/start').expect(201);
    expect(startRes.body.ok).toBe(true);
    expect(startRes.body.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(typeof startRes.body.ttlLeftMs).toBe('number');

    const listRes = await request.get('/api/screens').expect(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBe(0);

    const peekRes = await request.get(`/api/screens/pair/peek/${startRes.body.code}`).expect(200);
    expect(peekRes.body.ok).toBe(true);
    expect(peekRes.body.exists).toBe(true);
  });

  it('marks /api/screens/pair as deprecated', async () => {
    const res = await request.post('/api/screens/pair').send({}).expect(410);
    expect(res.body.error).toBe('ENDPOINT_DEPRECATED');
  });

  it('creates screen only through device pairing and consumes codes', async () => {
    const startRes = await request.post('/api/screens/pair/start').expect(201);
    const code = startRes.body.code;

    const pairRes = await request
      .post('/api/devices/pair')
      .send({ code, name: 'Lobby', location: 'HQ' })
      .expect(201);

    expect(pairRes.body.ok).toBe(true);
    expect(pairRes.body.deviceId.startsWith('dev_')).toBe(true);

    const listRes = await request.get('/api/screens').expect(200);
    expect(listRes.body.length).toBe(1);
    expect(listRes.body[0].meta.name).toBe('Lobby');

    await request
      .post('/api/devices/pair')
      .send({ code })
      .expect(404);
  });

  it('handles hello and pending regeneration lifecycle', async () => {
    const helloRes = await request
      .post('/api/screens/hello')
      .send({ fingerprint: 'fp-123', model: 'Chromecast', os: 'Android' })
      .expect(200);

    expect(helloRes.body.ok).toBe(true);
    expect(helloRes.body.code).toMatch(/^[A-Z0-9]{6}$/);

    const pendingRes = await request.get('/api/screens/pending').expect(200);
    expect(pendingRes.body.items.length).toBe(1);
    expect(pendingRes.body.items[0].id).toBe('fp-123');

    const regenRes = await request
      .post('/api/screens/pending/fp-123/regenerate')
      .expect(200);
    expect(regenRes.body.ok).toBe(true);
    expect(regenRes.body.code).toMatch(/^[A-Z0-9]{6}$/);

    const afterRegen = await request.get('/api/screens/pending').expect(200);
    expect(afterRegen.body.items[0].code).toBe(regenRes.body.code);

    await request
      .post('/api/devices/pair')
      .send({ code: regenRes.body.code })
      .expect(201);

    const afterPair = await request.get('/api/screens/pending').expect(200);
    expect(afterPair.body.items.length).toBe(0);
  });
});


