/**
 * Runtime session rehydration — unit + integration tests.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { getPrismaClient } from '../src/lib/prisma.js';
import { resetDb } from '../src/test/helpers/resetDb.js';
import {
  resolveActiveRuntimeSession,
  isRuntimeSessionRehydrationEnabled,
} from '../src/lib/runtime/runtimeSessionService.js';
import { initRuntimeCapabilities, resetRuntimeCapabilitiesForTests } from '../src/lib/runtime/runtimeCapabilitiesService.js';
import runtimeSessionRoutes from '../src/routes/runtimeSessionRoutes.js';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const dbAvailable = (() => {
  try {
    getPrismaClient();
    return true;
  } catch {
    return false;
  }
})();

const SESSION_FLAGS = {
  ENABLE_RUNTIME_SESSION_REHYDRATION: 'true',
  ENABLE_RUNTIME_STORE_FALLBACK: 'true',
  ENABLE_RUNTIME_MISSION_RESUME: 'true',
  ENABLE_MISSION_HANDOFF: 'true',
  ENABLE_RUNTIME_TARGET_READINESS: 'true',
};

vi.mock('../src/lib/orchestrator/advanceProactivePipelineStep.js', () => ({
  advanceProactivePipelineStep: vi.fn(async () => ({ ok: true })),
}));

function makeApp(user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/runtime/session', runtimeSessionRoutes);
  return app;
}

describe.skipIf(!dbAvailable)('runtimeSessionService', () => {
  let prisma;
  let userId;

  beforeAll(() => {
    Object.assign(process.env, SESSION_FLAGS);
    prisma = getPrismaClient();
  });

  beforeEach(async () => {
    resetRuntimeCapabilitiesForTests();
    Object.assign(process.env, SESSION_FLAGS);
    initRuntimeCapabilities();
    await resetDb(prisma);
    const user = await prisma.user.create({
      data: {
        email: `session-test-${Date.now()}@example.com`,
        passwordHash: 'x',
        handle: `session_${Date.now()}`,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect?.();
  });

  it('returns latest active mission for user', async () => {
    const older = await prisma.missionPipeline.create({
      data: {
        type: 'launch_campaign',
        title: 'Older mission',
        status: 'executing',
        runState: 'running',
        targetType: 'generic',
        executionMode: 'GUIDED_RUN',
        requiresConfirmation: false,
        createdBy: userId,
        tenantId: userId,
      },
    });
    await prisma.missionPipeline.create({
      data: {
        type: 'launch_campaign',
        title: 'Newer mission',
        status: 'queued',
        runState: 'idle',
        targetType: 'generic',
        executionMode: 'GUIDED_RUN',
        requiresConfirmation: false,
        createdBy: userId,
        tenantId: userId,
      },
    });
    await prisma.missionPipeline.update({
      where: { id: older.id },
      data: { updatedAt: new Date(Date.now() - 60_000) },
    });

    const session = await resolveActiveRuntimeSession({ userId, source: 'test' });
    expect(session.ok).toBe(true);
    expect(session.activeMissionId).toBeTruthy();
    expect(session.activeMission?.title).toBe('Newer mission');
  });

  it('returns latest store when no active mission exists', async () => {
    await prisma.business.create({
      data: {
        userId,
        name: 'Store A',
        type: 'retail',
        slug: `store-a-${Date.now()}`,
        isActive: true,
      },
    });
    const session = await resolveActiveRuntimeSession({ userId, source: 'test' });
    expect(session.ok).toBe(true);
    expect(session.activeStoreId).toBeTruthy();
    expect(session.latestStore?.name).toBe('Store A');
    expect(session.needsStoreFirst).toBe(false);
  });

  it('returns requiresStoreSelection when multiple stores and no mission store', async () => {
    await prisma.business.createMany({
      data: [
        { userId, name: 'Alpha', type: 'retail', slug: `alpha-${Date.now()}`, isActive: true },
        { userId, name: 'Beta', type: 'retail', slug: `beta-${Date.now()}`, isActive: true },
      ],
    });
    const session = await resolveActiveRuntimeSession({ userId, source: 'test' });
    expect(session.requiresStoreSelection).toBe(true);
    expect(session.storeCandidates.length).toBeGreaterThanOrEqual(2);
    expect(session.activeStoreId).toBeNull();
    expect(session.needsStoreFirst).toBe(false);
    expect(session.runtimeGuidance?.some((g) => g.subtype === 'store_selection')).not.toBe(true);
    expect(session.runtimeGuidance?.some((g) => g.subtype === 'readiness')).not.toBe(true);
  });

  it('returns store_selection runtimeGuidance only when an active mission needs a store', async () => {
    const stores = await prisma.business.createMany({
      data: [
        { userId, name: 'Alpha', type: 'retail', slug: `alpha-mission-${Date.now()}`, isActive: true },
        { userId, name: 'Beta', type: 'retail', slug: `beta-mission-${Date.now()}`, isActive: true },
      ],
    });
    void stores;
    const mission = await prisma.missionPipeline.create({
      data: {
        type: 'launch_campaign',
        title: 'Pick a store',
        status: 'executing',
        runState: 'running',
        targetType: 'generic',
        executionMode: 'GUIDED_RUN',
        createdBy: userId,
      },
    });
    const session = await resolveActiveRuntimeSession({
      userId,
      requestedMissionId: mission.id,
      source: 'test',
    });
    expect(session.requiresStoreSelection).toBe(true);
    expect(session.runtimeGuidance?.some((g) => g.subtype === 'store_selection')).toBe(true);
  });

  it('hydrates completed analyze_store step after refresh scenario', async () => {
    const store = await prisma.business.create({
      data: {
        userId,
        name: 'Hydrate Store',
        type: 'retail',
        slug: `hydrate-${Date.now()}`,
        isActive: true,
      },
    });
    const mission = await prisma.missionPipeline.create({
      data: {
        type: 'launch_campaign',
        title: 'Campaign plan',
        status: 'completed',
        runState: 'done',
        targetType: 'store',
        targetId: store.id,
        executionMode: 'GUIDED_RUN',
        requiresConfirmation: false,
        createdBy: userId,
        tenantId: userId,
        metadataJson: {
          proactiveStepStatus: {
            '1': { status: 'completed', tool: 'analyze_store' },
            '2': { status: 'pending', tool: 'create_promotion' },
          },
          proactivePlanSteps: [
            { step: 1, title: 'Analyze store', description: 'Review store', recommendedTool: 'analyze_store' },
            { step: 2, title: 'Create promo', description: 'Promo', recommendedTool: 'create_promotion' },
          ],
        },
      },
    });

    const session = await resolveActiveRuntimeSession({
      userId,
      requestedMissionId: mission.id,
      source: 'refresh_test',
    });
    expect(session.activeMissionId).toBe(mission.id);
    expect(session.completedStepNumbers).toEqual([1]);
    expect(session.pendingProactiveStepNumber).toBe(2);
    expect(session.proactivePlanSteps.length).toBe(2);
  });

  it('GET /api/runtime/session/active returns session payload', async () => {
    expect(isRuntimeSessionRehydrationEnabled()).toBe(true);
    const token = jwt.sign({ sub: userId, id: userId }, JWT_SECRET);
    const app = makeApp({ id: userId });
    await prisma.missionPipeline.create({
      data: {
        type: 'launch_campaign',
        title: 'API mission',
        status: 'executing',
        runState: 'running',
        targetType: 'generic',
        executionMode: 'GUIDED_RUN',
        requiresConfirmation: false,
        createdBy: userId,
        tenantId: userId,
      },
    });
    const res = await request(app)
      .get('/api/runtime/session/active')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.activeMissionId).toBeTruthy();
  });

  it('regression: needsStoreFirst only when user has zero stores', async () => {
    const session = await resolveActiveRuntimeSession({ userId, source: 'test' });
    expect(session.needsStoreFirst).toBe(true);
    expect(session.warnings).toContain('NEEDS_STORE_FIRST');
    expect(session.runtimeGuidance?.length ?? 0).toBe(0);
  });

  it('regression: missing-store runtimeGuidance when active mission needs a store', async () => {
    const mission = await prisma.missionPipeline.create({
      data: {
        type: 'launch_campaign',
        title: 'Launch campaign',
        status: 'executing',
        runState: 'running',
        targetType: 'generic',
        executionMode: 'GUIDED_RUN',
        createdBy: userId,
      },
    });
    const session = await resolveActiveRuntimeSession({
      userId,
      requestedMissionId: mission.id,
      source: 'test',
    });
    expect(session.needsStoreFirst).toBe(true);
    expect(session.runtimeGuidance?.length).toBe(1);
    expect(session.runtimeGuidance[0].message).toMatch(/need a store first/i);
  });

  it('regression: needsStoreFirst false while store mission is at checkpoint', async () => {
    const mission = await prisma.missionPipeline.create({
      data: {
        type: 'store',
        title: 'Create mini website: Test Cafe',
        status: 'awaiting_input',
        runState: 'blocked_on_checkpoint',
        targetType: 'store',
        executionMode: 'AUTO_RUN',
        requiresConfirmation: false,
        createdBy: userId,
        tenantId: userId,
      },
    });
    await prisma.missionPipelineStep.create({
      data: {
        missionId: mission.id,
        orderIndex: 1,
        toolName: 'owner_logo_checkpoint',
        label: 'Upload logo',
        status: 'awaiting_input',
        stepKind: 'checkpoint',
        configJson: { prompt: 'Upload logo', options: ['Skip'] },
      },
    });

    const session = await resolveActiveRuntimeSession({
      userId,
      requestedMissionId: mission.id,
      source: 'checkpoint_store_build',
    });

    expect(session.activeMissionId).toBe(mission.id);
    expect(session.needsStoreFirst).toBe(false);
    expect(session.runtimeGuidance?.some((g) => g.message?.includes('need a store first'))).not.toBe(true);
  });

  it('does not return checkpoint mission after user end (cancelled + endedByUser)', async () => {
    const mission = await prisma.missionPipeline.create({
      data: {
        type: 'store',
        title: 'Ended checkpoint',
        status: 'cancelled',
        runState: 'cancelled',
        targetType: 'store',
        executionMode: 'AUTO_RUN',
        requiresConfirmation: false,
        createdBy: userId,
        tenantId: userId,
        metadataJson: { endedByUser: true, endedAt: new Date().toISOString() },
      },
    });
    await prisma.missionPipelineStep.create({
      data: {
        missionId: mission.id,
        orderIndex: 1,
        toolName: 'owner_logo_checkpoint',
        label: 'Upload logo',
        status: 'awaiting_input',
        stepKind: 'checkpoint',
        configJson: { prompt: 'Upload logo', options: ['Skip'] },
      },
    });

    const session = await resolveActiveRuntimeSession({ userId, source: 'after_end_mission' });
    expect(session.activeMissionId).not.toBe(mission.id);
    expect(session.hasActiveCheckpoint).toBe(false);
  });

  it('returns awaiting_input checkpoint mission on refresh', async () => {
    const mission = await prisma.missionPipeline.create({
      data: {
        type: 'store',
        title: 'Create store checkpoint',
        status: 'awaiting_input',
        runState: 'blocked_on_checkpoint',
        targetType: 'store',
        executionMode: 'AUTO_RUN',
        requiresConfirmation: false,
        createdBy: userId,
        tenantId: userId,
        metadataJson: {},
      },
    });
    const step = await prisma.missionPipelineStep.create({
      data: {
        missionId: mission.id,
        orderIndex: 1,
        toolName: 'owner_logo_checkpoint',
        label: 'Upload logo',
        status: 'awaiting_input',
        stepKind: 'checkpoint',
        configJson: {
          prompt: 'Upload your logo or skip for now',
          options: ['Skip', 'Upload logo'],
          outputKey: 'logo',
        },
      },
    });
    await prisma.missionPipeline.update({
      where: { id: mission.id },
      data: { currentStepId: step.id },
    });

    const session = await resolveActiveRuntimeSession({ userId, source: 'logo_checkpoint_refresh' });
    expect(session.activeMissionId).toBe(mission.id);
    expect(session.hasActiveCheckpoint).toBe(true);
    expect(session.activeCheckpoint?.stepId).toBe(step.id);
    expect(session.activeCheckpoint?.prompt).toContain('logo');
    expect(session.activeCheckpoint?.options).toEqual(['Skip', 'Upload logo']);

    const { cancelMissionPipeline } = await import('../src/lib/missionPipelineService.js');
    const cancelled = await cancelMissionPipeline(mission.id);
    expect(cancelled.ok).toBe(true);

    const afterEnd = await resolveActiveRuntimeSession({ userId, source: 'after_end_mission' });
    expect(afterEnd.activeMissionId).not.toBe(mission.id);
    expect(afterEnd.hasActiveCheckpoint).toBe(false);
  });
});
