/**
 * Runtime Kernel step execution integration tests.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { getPrismaClient } from '../src/lib/prisma.js';
import { resetDb } from '../src/test/helpers/resetDb.js';
import runtimeMissionStepRoutes from '../src/routes/runtimeMissionStepRoutes.js';
import { hydrateCompletedStepNumbers } from '../src/lib/runtime/runtimeStepState.js';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const dbAvailable = (() => {
  try {
    getPrismaClient();
    return true;
  } catch {
    return false;
  }
})();

const ENABLE_FLAGS = {
  ENABLE_PERFORMER_RUNTIME_KERNEL: 'true',
  ENABLE_RUNTIME_STEP_EXECUTION: 'true',
  ENABLE_SHARED_RUNTIME_TOOL_REGISTRY: 'true',
};

vi.mock('../src/lib/orchestrator/dispatchExecution.js', () => ({
  dispatchExecution: vi.fn(async (_meta, fn) => {
    const out = await fn();
    return out?.status ? out : { status: 'ok', output: out ?? { summary: 'Store analysis complete', findings: [] } };
  }),
}));

vi.mock('../src/lib/agentPlanning/agentOrchestrator.js', () => ({
  dispatchTaskWithAgentHint: vi.fn(async () => ({
    status: 'ok',
    output: { summary: 'Store analysis complete', findings: ['layout ok'], suggestions: ['add hero'] },
  })),
}));

vi.mock('../src/lib/missionBlackboard.js', () => ({
  appendEvent: vi.fn(async () => ({ ok: true, seq: 1 })),
}));

function makeApp(user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/runtime/missions', runtimeMissionStepRoutes);
  return app;
}

describe.skipIf(!dbAvailable)('runtime kernel step execution', () => {
  let prisma;
  let testUser;
  let testToken;

  beforeAll(async () => {
    prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
  });

  beforeEach(async () => {
    Object.assign(process.env, ENABLE_FLAGS);
    await resetDb(prisma);
    testUser = await prisma.user.create({
      data: {
        email: 'runtime-kernel-step@example.com',
        passwordHash: 'test-hash',
        displayName: 'Runtime Kernel Step',
        roles: '["viewer"]',
      },
    });
    testToken = jwt.sign({ userId: testUser.id }, JWT_SECRET);
  });

  afterAll(async () => {
    if (dbAvailable) await resetDb(prisma);
  });

  it('proactive Step 1 execute persists metadataJson.stepOutputs and proactiveStepStatus', async () => {
    const mission = await prisma.missionPipeline.create({
      data: {
        type: 'analyze_store',
        title: 'Analyze store plan',
        status: 'executing',
        runState: 'idle',
        targetType: 'store',
        targetId: 'store-runtime-kernel',
        executionMode: 'GUIDED_RUN',
        requiresConfirmation: false,
        metadataJson: { storeId: 'store-runtime-kernel' },
        createdBy: testUser.id,
      },
    });

    const app = makeApp(testUser);
    const res = await request(app)
      .post(`/api/runtime/missions/${mission.id}/steps/1/execute`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        requestedTool: 'analyze_store',
        proactivePlanTotal: 1,
        parameters: { storeId: 'store-runtime-kernel' },
        proactivePlanStep: { step: 1, title: 'Analyze Store' },
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.canonicalTool).toBe('analyze_store');
    expect(res.body.stepStatus).toBe('completed');

    const refreshed = await prisma.missionPipeline.findUnique({
      where: { id: mission.id },
      select: { metadataJson: true },
    });
    const meta = refreshed?.metadataJson ?? {};
    expect(meta.stepOutputs?.analyze_store).toBeTruthy();
    expect(hydrateCompletedStepNumbers(meta)).toEqual([1]);
  });

  it('clicking completed Step 1 does not execute again (idempotent)', async () => {
    const mission = await prisma.missionPipeline.create({
      data: {
        type: 'analyze_store',
        title: 'Analyze store plan',
        status: 'executing',
        runState: 'idle',
        targetType: 'store',
        targetId: 'store-runtime-kernel-2',
        executionMode: 'GUIDED_RUN',
        requiresConfirmation: false,
        metadataJson: {
          storeId: 'store-runtime-kernel-2',
          proactiveStepStatus: {
            '1': {
              status: 'completed',
              tool: 'analyze_store',
              stepNumber: 1,
              updatedAt: new Date().toISOString(),
            },
          },
          stepOutputs: {
            analyze_store: { summary: 'Already done' },
          },
        },
        createdBy: testUser.id,
      },
    });

    const { dispatchTaskWithAgentHint } = await import('../src/lib/agentPlanning/agentOrchestrator.js');
    vi.mocked(dispatchTaskWithAgentHint).mockClear();

    const app = makeApp(testUser);
    const res = await request(app)
      .post(`/api/runtime/missions/${mission.id}/steps/1/execute`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        requestedTool: 'analyze_store',
        proactivePlanTotal: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.alreadyCompleted).toBe(true);
    expect(vi.mocked(dispatchTaskWithAgentHint)).not.toHaveBeenCalled();
  });

  it('unknown proactive tool returns rejected status', async () => {
    const mission = await prisma.missionPipeline.create({
      data: {
        type: 'launch_campaign',
        title: 'Bad tool plan',
        status: 'executing',
        runState: 'idle',
        targetType: 'generic',
        executionMode: 'GUIDED_RUN',
        requiresConfirmation: false,
        createdBy: testUser.id,
      },
    });

    const app = makeApp(testUser);
    const res = await request(app)
      .post(`/api/runtime/missions/${mission.id}/steps/1/execute`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ requestedTool: 'totally_fake_tool_xyz' });

    expect(res.status).toBe(422);
    expect(res.body.ok).toBe(false);
    expect(res.body.stepStatus).toBe('rejected');
  });
});
