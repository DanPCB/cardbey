import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';
import { generateToken } from '../src/middleware/auth.js';

const prisma = new PrismaClient();
const testRequest = request(app);

describe('Screens Pairing - Session Bind Flow', () => {
  let testUser;
  let authToken;
  let storeId;

  beforeEach(async () => {
    await resetDb(prisma);

    testUser = await prisma.user.create({
      data: {
        email: `pair-test-${Date.now()}@example.com`,
        passwordHash: 'test-hash',
        displayName: 'Pair Test User',
        roles: '["owner"]',
        role: 'owner',
      },
    });

    const store = await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Pair Test Store',
        type: 'cafe',
        slug: `pair-test-store-${Date.now()}`,
      },
    });

    storeId = store.id;
    authToken = generateToken(testUser.id);
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('completes Device V2 pairing via initiate shim and complete-pairing', async () => {
    const fingerprint = `TEST-FP-${Date.now()}`;
    const initiateRes = await testRequest
      .post('/api/screens/pair/initiate')
      .send({
        fingerprint,
        model: 'Test TV',
        name: 'Test Screen',
        location: 'Dev Lab',
      })
      .expect(200);

    expect(initiateRes.body.ok).toBe(true);
    expect(initiateRes.body.engine).toBe('DEVICE_V2');
    const { sessionId, code } = initiateRes.body;
    expect(sessionId).toBeDefined();
    expect(code).toBeDefined();

    const completeRes = await testRequest
      .post('/api/device/complete-pairing')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sessionId,
        pairingCode: code,
        storeId,
        name: 'Bound Screen',
        location: 'Dev Lab',
      })
      .expect(200);

    expect(completeRes.body.ok).toBe(true);
    expect(completeRes.body.deviceId).toBe(sessionId);
    expect(completeRes.body.status).toBe('online');

    const statusRes = await testRequest
      .get(`/api/screens/pair/sessions/${sessionId}/status`)
      .expect(200);

    expect(statusRes.body.ok).toBe(true);
    expect(statusRes.body.status).toBe('bound');
    expect(statusRes.body.engine).toBe('DEVICE_V2');
    expect(statusRes.body.sessionId).toBe(sessionId);

    const device = await prisma.device.findUnique({
      where: { id: sessionId },
    });

    expect(device).toBeTruthy();
    expect(device.tenantId).toBe(testUser.id);
    expect(device.storeId).toBe(storeId);
    expect(device.pairingCode).toBeNull();
    expect(device.status).toBe('online');
  });
});
