import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';

const prisma = new PrismaClient();
const testRequest = request(app);

describe('Screens Pairing - Session Bind Flow', () => {
  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('binds a pairing session and flips status to bound', async () => {
    // 1) Initiate pairing to get sessionId + code
    const initiateRes = await testRequest
      .post('/api/screens/pair/initiate')
      .send({
        fingerprint: 'TEST-FP-123',
        model: 'Test TV',
        name: 'Test Screen',
        location: 'Dev Lab',
      })
      .expect(200);

    expect(initiateRes.body.ok).toBe(true);
    const { sessionId, code } = initiateRes.body;
    expect(sessionId).toBeDefined();
    expect(code).toBeDefined();

    // 2) Bind the session with correct code
    const bindRes = await testRequest
      .post(`/api/screens/pair/sessions/${sessionId}/bind`)
      .send({
        code,
        name: 'Bound Screen',
        notes: 'test bind from vitest',
      })
      .expect(200);

    expect(bindRes.body.ok).toBe(true);
    expect(bindRes.body.status).toBe('bound');
    expect(bindRes.body.sessionId).toBe(sessionId);
    expect(bindRes.body.device).toBeDefined();
    expect(bindRes.body.device.id).toBeDefined();
    expect(bindRes.body.device.name).toBeTruthy();

    const screenId = bindRes.body.device.id;

    // 3) Status endpoint should now report bound with screenId + token
    const statusRes = await testRequest
      .get(`/api/screens/pair/sessions/${sessionId}/status`)
      .expect(200);

    expect(statusRes.body.ok).toBe(true);
    expect(statusRes.body.status).toBe('bound');
    expect(statusRes.body.screenId).toBe(screenId);
    expect(statusRes.body.token).toBeDefined();

    // 4) Ensure Screen exists in DB and is marked as paired
    const screen = await prisma.screen.findUnique({
      where: { id: screenId },
    });

    expect(screen).toBeTruthy();
    expect(screen.paired).toBe(true);
    expect(screen.status).toBe('ONLINE');
  });
});


