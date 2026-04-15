/**
 * Job result contract: GET /api/mi/orchestra/job/:jobId
 * Ensures that when status is 'completed', the response includes generationRunId (or storeId)
 * so the UI can resolve the draft. Prevents marking job completed before draft is resolvable.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/server.js';
import { resetDb } from '../src/test/helpers/resetDb.js';

const prisma = new PrismaClient();
const testRequest = request(app);

describe('Orchestra job result contract', () => {
  let testUser;
  let testTaskId;

  beforeEach(async () => {
    await resetDb(prisma);

    testUser = await prisma.user.create({
      data: {
        email: 'orchestra-contract@example.com',
        passwordHash: 'test-hash',
        displayName: 'Orchestra Contract Test',
        roles: '["viewer"]',
      },
    });
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('GET /api/mi/orchestra/job/:jobId returns contract with generationRunId when status=completed', async () => {
    const task = await prisma.orchestratorTask.create({
      data: {
        entryPoint: 'build_store',
        tenantId: 'test-tenant',
        userId: testUser.id,
        status: 'completed',
        request: { generationRunId: 'test-run-123', storeId: 'temp', goal: 'build_store' },
        result: { ok: true, generationRunId: 'test-run-123' },
      },
    });
    testTaskId = task.id;

    const res = await testRequest
      .get(`/api/mi/orchestra/job/${task.id}`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.jobId).toBe(task.id);
    expect(res.body.status).toBe('completed');
    // Contract: completed jobs must expose generationRunId so UI can fetch draft
    expect(res.body.generationRunId).toBe('test-run-123');
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.pollAfterMs).toBeDefined();
  });

  it('GET /api/mi/orchestra/job/:jobId returns 200 with status=failed for unknown jobId (no 404)', async () => {
    const res = await testRequest
      .get('/api/mi/orchestra/job/unknown-job-id-123')
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe('failed');
    expect(res.body.error).toBe('job_not_found');
  });
});
