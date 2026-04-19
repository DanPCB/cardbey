/**
 * Regression: job auto-run from /orchestra/start.
 * After POST /api/mi/orchestra/start (build_store), the job should transition
 * from queued → running (or completed) without ever calling POST .../run.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/server.js';
import { getPrismaClient } from '../src/lib/prisma.js';
import { resetDb } from '../src/test/helpers/resetDb.js';

/** Same client as the imported app — avoid a second Prisma engine + $disconnect (Tokio panic on Windows). */
const prisma = getPrismaClient();
const testRequest = request(app);

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-this';
const POLL_INTERVAL_MS = 500;
// Generous timeout for CI/load; generateDraft may hit networked AI/image calls. "Queued forever" = failure.
const POLL_MAX_WAIT_MS = 45000; // 45s

/** Avoid resetDb / process teardown while runBuildStoreJob + generateDraft still holds the Prisma engine (Windows N-API panic). */
async function waitForBuildStoreOrchestratorDrain(prismaClient, maxMs = 120000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const pending = await prismaClient.orchestratorTask.count({
      where: {
        entryPoint: 'build_store',
        status: { in: ['queued', 'running'] },
      },
    });
    if (pending === 0) return;
    await new Promise((r) => setTimeout(r, 400));
  }
}

describe('Orchestra job auto-run (no /run call)', () => {
  let testUser;
  let token;

  beforeEach(async () => {
    await resetDb(prisma);

    testUser = await prisma.user.create({
      data: {
        email: 'auto-run-test@example.com',
        passwordHash: 'test-hash',
        displayName: 'Auto Run Test',
        roles: '["viewer"]',
      },
    });
    token = jwt.sign({ userId: testUser.id }, JWT_SECRET);
  });

  afterAll(
    async () => {
      await waitForBuildStoreOrchestratorDrain(prisma);
      await resetDb(prisma);
    },
    130000,
  );

  it('job transitions from queued without calling POST /run', async () => {
    const startRes = await testRequest
      .post('/api/mi/orchestra/start')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .send({
        goal: 'build_store',
        businessName: 'Auto Run Cafe',
        businessType: 'cafe',
      })
      .expect(200);

    expect(startRes.body.ok).toBe(true);
    expect(startRes.body.jobId).toBeDefined();
    const jobId = startRes.body.jobId;

    // Poll until status is not queued (or timeout). We do NOT call POST /run.
    const deadline = Date.now() + POLL_MAX_WAIT_MS;
    let status = 'queued';
    while (Date.now() < deadline) {
      const jobRes = await testRequest
        .get(`/api/mi/orchestra/job/${jobId}`)
        .expect(200);
      status = jobRes.body.status || jobRes.body.meta?.status || 'unknown';
      if (status !== 'queued') break;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    // Invariant: job must leave "queued" within POLL_MAX_WAIT_MS. "Queued forever" = regression (auto-run not firing).
    expect(status).not.toBe('queued');
    // Accept running, completed, or failed (completed/failed = acceptable outcomes)
    expect(['running', 'completed', 'failed']).toContain(status);
  });

  it('start returns; job eventually leaves queued within timeout (regression: never queued forever)', async () => {
    const startRes = await testRequest
      .post('/api/mi/orchestra/start')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${token}`)
      .send({
        goal: 'build_store',
        businessName: 'Invariant Cafe',
        businessType: 'cafe',
      })
      .expect(200);

    const jobId = startRes.body.jobId;
    expect(jobId).toBeDefined();

    const deadline = Date.now() + POLL_MAX_WAIT_MS;
    let status = 'queued';
    while (Date.now() < deadline) {
      const jobRes = await testRequest.get(`/api/mi/orchestra/job/${jobId}`).expect(200);
      status = jobRes.body.status || jobRes.body.meta?.status || 'unknown';
      if (status !== 'queued') break;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    expect(status).not.toBe('queued');
  });
});
