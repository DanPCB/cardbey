/**
 * Runtime Prerequisite Resolution integration tests.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { getPrismaClient } from '../src/lib/prisma.js';
import { resetDb } from '../src/test/helpers/resetDb.js';
import runtimeMissionStepRoutes from '../src/routes/runtimeMissionStepRoutes.js';
import runtimePrerequisiteRoutes from '../src/routes/runtimePrerequisiteRoutes.js';
import { initRuntimeCapabilities, resetRuntimeCapabilitiesForTests } from '../src/lib/runtime/runtimeCapabilitiesService.js';
import { readRuntimePrerequisites } from '../src/lib/runtime/runtimePrerequisiteState.js';
import { resolveMissionPrerequisites } from '../src/lib/runtime/runtimePrerequisiteResolver.js';

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
  ENABLE_RUNTIME_PREREQUISITE_RESOLUTION: 'true',
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
  app.use('/api/runtime/missions', runtimePrerequisiteRoutes);
  return app;
}

describe.skipIf(!dbAvailable)('runtime prerequisite resolution', () => {
  let prisma;
  let testUser;
  let testToken;

  beforeAll(async () => {
    prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
  });

  beforeEach(async () => {
    resetRuntimeCapabilitiesForTests();
    Object.assign(process.env, ENABLE_FLAGS);
    initRuntimeCapabilities();
    await resetDb(prisma);
    testUser = await prisma.user.create({
      data: {
        email: 'runtime-prereq@example.com',
        passwordHash: 'test-hash',
        displayName: 'Runtime Prereq',
        roles: '["viewer"]',
      },
    });
    testToken = jwt.sign({ userId: testUser.id }, JWT_SECRET);
  });

  afterAll(async () => {
    if (dbAvailable) await resetDb(prisma);
  });

  it('analyze_store without store returns prerequisite response (412)', async () => {
    const mission = await prisma.missionPipeline.create({
      data: {
        type: 'launch_campaign',
        title: 'Launch campaign',
        status: 'executing',
        runState: 'idle',
        targetType: 'generic',
        executionMode: 'GUIDED_RUN',
        requiresConfirmation: false,
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
        proactivePlanStep: { step: 1, title: 'Analyze Store' },
      });

    expect(res.status).toBe(412);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe('PREREQUISITE_REQUIRED');
    expect(res.body.prerequisiteBlocked).toBe(true);
    expect(res.body.missingRequirements?.[0]?.type).toBe('store_required');
    expect(vi.mocked(dispatchTaskWithAgentHint)).not.toHaveBeenCalled();

    const refreshed = await prisma.missionPipeline.findUnique({
      where: { id: mission.id },
      select: { metadataJson: true, type: true },
    });
    expect(refreshed?.type).toBe('launch_campaign');
    const rp = readRuntimePrerequisites(refreshed?.metadataJson);
    expect(rp?.status).toBe('waiting_for_prerequisite');
    expect(rp?.resumableIntent?.originalTool).toBe('analyze_store');
  });

  it('existing stores → select store flow resumes original step', async () => {
    const store = await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Existing Store',
        type: 'retail',
        slug: `existing-store-${Date.now()}`,
        isActive: true,
      },
    });

    const mission = await prisma.missionPipeline.create({
      data: {
        type: 'launch_campaign',
        title: 'Launch campaign',
        status: 'executing',
        runState: 'idle',
        targetType: 'generic',
        executionMode: 'GUIDED_RUN',
        requiresConfirmation: false,
        createdBy: testUser.id,
        metadataJson: {
          runtimePrerequisites: {
            status: 'waiting_for_prerequisite',
            resumableIntent: {
              originalTool: 'analyze_store',
              originalMissionId: 'pending',
              stepNumber: 1,
            },
            stepNumber: 1,
            requestedTool: 'analyze_store',
          },
        },
      },
    });

    await prisma.missionPipeline.update({
      where: { id: mission.id },
      data: {
        metadataJson: {
          runtimePrerequisites: {
            status: 'waiting_for_prerequisite',
            resumableIntent: {
              originalTool: 'analyze_store',
              originalMissionId: mission.id,
              stepNumber: 1,
            },
            stepNumber: 1,
            requestedTool: 'analyze_store',
          },
        },
      },
    });

    const app = makeApp(testUser);
    const resolveRes = await request(app)
      .post(`/api/runtime/missions/${mission.id}/prerequisites/resolve`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ action: 'select_existing_store', storeId: store.id, autoResume: true });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.ok).toBe(true);
    expect(resolveRes.body.code).toBe('PREREQUISITE_RESOLVED');
    expect(resolveRes.body.resumeResult?.ok).toBe(true);

    const refreshed = await prisma.missionPipeline.findUnique({
      where: { id: mission.id },
      select: { targetId: true, metadataJson: true, type: true },
    });
    expect(refreshed?.targetId).toBe(store.id);
    expect(refreshed?.type).toBe('launch_campaign');
    const rp = readRuntimePrerequisites(refreshed?.metadataJson);
    expect(rp?.status).toBe('resumed_after_prerequisite');
  });

  it('create_store prerequisite spawns child with parent lineage', async () => {
    const mission = await prisma.missionPipeline.create({
      data: {
        type: 'launch_campaign',
        title: 'Launch campaign',
        status: 'executing',
        runState: 'idle',
        targetType: 'generic',
        executionMode: 'GUIDED_RUN',
        requiresConfirmation: false,
        createdBy: testUser.id,
        metadataJson: {
          runtimePrerequisites: {
            status: 'waiting_for_prerequisite',
            resumableIntent: {
              originalTool: 'analyze_store',
              originalMissionId: 'pending',
              stepNumber: 1,
            },
            stepNumber: 1,
          },
        },
      },
    });

    await prisma.missionPipeline.update({
      where: { id: mission.id },
      data: {
        metadataJson: {
          runtimePrerequisites: {
            status: 'waiting_for_prerequisite',
            resumableIntent: {
              originalTool: 'analyze_store',
              originalMissionId: mission.id,
              stepNumber: 1,
            },
            stepNumber: 1,
          },
        },
      },
    });

    const app = makeApp(testUser);
    const res = await request(app)
      .post(`/api/runtime/missions/${mission.id}/prerequisites/resolve`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ action: 'create_store', autoResume: false });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.code).toBe('PREREQUISITE_CHILD_SPAWNED');
    expect(res.body.childMissionId).toBeTruthy();
    expect(res.body.parentMissionId).toBe(mission.id);

    const { getMissionParentMissionId } = await import(
      '../src/lib/mission/missionParentLineage.js'
    );
    const child = await prisma.missionPipeline.findUnique({
      where: { id: res.body.childMissionId },
      select: { type: true, metadataJson: true },
    });
    expect(getMissionParentMissionId(child)).toBe(mission.id);
    expect(child?.type).toBe('store');
    expect(child?.metadataJson?.runtimePrerequisiteChild).toBe(true);

    const parent = await prisma.missionPipeline.findUnique({
      where: { id: mission.id },
      select: { type: true, metadataJson: true },
    });
    expect(parent?.type).toBe('launch_campaign');
  });

  it('refresh during prerequisite flow restores blocked state from metadata', async () => {
    const mission = await prisma.missionPipeline.create({
      data: {
        type: 'launch_campaign',
        title: 'Launch campaign',
        status: 'executing',
        runState: 'idle',
        targetType: 'generic',
        executionMode: 'GUIDED_RUN',
        requiresConfirmation: false,
        createdBy: testUser.id,
        metadataJson: {
          runtimePrerequisites: {
            status: 'waiting_for_prerequisite',
            blockingReason: 'store_required',
            resumableIntent: { originalTool: 'analyze_store', stepNumber: 1 },
            stepNumber: 1,
          },
        },
      },
    });

    const row = await prisma.missionPipeline.findUnique({ where: { id: mission.id } });
    const prereq = await resolveMissionPrerequisites({
      user: testUser,
      mission: row,
      requestedTool: 'analyze_store',
      stepNumber: 1,
    });
    expect(prereq.requirementsMet).toBe(false);
    const stored = readRuntimePrerequisites(row.metadataJson);
    expect(stored?.status).toBe('waiting_for_prerequisite');
    expect(stored?.resumableIntent?.originalTool).toBe('analyze_store');
  });

  it('resolver lists existing stores for select flow', async () => {
    await prisma.business.create({
      data: { userId: testUser.id, name: 'Store A', type: 'retail', slug: `store-a-${Date.now()}`, isActive: true },
    });
    const mission = await prisma.missionPipeline.create({
      data: {
        type: 'launch_campaign',
        title: 'Campaign',
        status: 'executing',
        runState: 'idle',
        targetType: 'generic',
        executionMode: 'GUIDED_RUN',
        createdBy: testUser.id,
      },
    });
    const row = await prisma.missionPipeline.findUnique({ where: { id: mission.id } });
    const result = await resolveMissionPrerequisites({
      user: testUser,
      mission: row,
      requestedTool: 'analyze_store',
      stepNumber: 1,
    });
    expect(result.requirementsMet).toBe(false);
    expect(result.suggestedActions).toContain('select_existing_store');
    expect(result.storeCandidates?.length).toBeGreaterThan(0);
    expect(result.suggestedActions).toContain('create_store');
  });

  it('with explicit storeId on mission, step executes without prerequisite block', async () => {
    const store = await prisma.business.create({
      data: {
        userId: testUser.id,
        name: 'Bound Store',
        type: 'retail',
        slug: `bound-store-${Date.now()}`,
        isActive: true,
      },
    });
    const mission = await prisma.missionPipeline.create({
      data: {
        type: 'launch_campaign',
        title: 'Launch campaign',
        status: 'executing',
        runState: 'idle',
        targetType: 'store',
        targetId: store.id,
        executionMode: 'GUIDED_RUN',
        requiresConfirmation: false,
        metadataJson: { storeId: store.id },
        createdBy: testUser.id,
      },
    });

    const app = makeApp(testUser);
    const res = await request(app)
      .post(`/api/runtime/missions/${mission.id}/steps/1/execute`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ requestedTool: 'analyze_store', proactivePlanTotal: 1 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.prerequisiteBlocked).toBeFalsy();
  });
});
