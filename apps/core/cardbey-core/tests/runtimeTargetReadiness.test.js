/**
 * Runtime Target Readiness tests.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getPrismaClient } from '../src/lib/prisma.js';
import { resetDb } from '../src/test/helpers/resetDb.js';
import {
  resolveStoreReadiness,
  resolveTargetReadiness,
  STORE_READINESS,
} from '../src/lib/runtime/runtimeTargetReadinessService.js';
import { resolveActiveRuntimeSession } from '../src/lib/runtime/runtimeSessionService.js';
import {
  initRuntimeCapabilities,
  resetRuntimeCapabilitiesForTests,
} from '../src/lib/runtime/runtimeCapabilitiesService.js';

const dbAvailable = (() => {
  try {
    getPrismaClient();
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!dbAvailable)('runtime target readiness', () => {
  let prisma;
  let userId;

  beforeAll(async () => {
    prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
  });

  beforeEach(async () => {
    resetRuntimeCapabilitiesForTests();
    process.env.ENABLE_RUNTIME_SESSION_REHYDRATION = 'true';
    process.env.ENABLE_RUNTIME_TARGET_READINESS = 'true';
    initRuntimeCapabilities();
    await resetDb(prisma);
    const user = await prisma.user.create({
      data: {
        email: 'readiness@example.com',
        passwordHash: 'hash',
        displayName: 'Readiness User',
        roles: '["viewer"]',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (dbAvailable) await resetDb(prisma);
  });

  it('no store → missing readiness (prerequisite territory)', async () => {
    const r = await resolveStoreReadiness({ userId });
    expect(r.exists).toBe(false);
    expect(r.readinessState).toBe(STORE_READINESS.MISSING);
    expect(r.recommendedActions).toContain('create_store');
  });

  it('draft store ready → publish guidance', async () => {
    const draft = await prisma.draftStore.create({
      data: {
        mode: 'ai',
        status: 'ready',
        expiresAt: new Date(Date.now() + 86400000),
        input: { businessName: 'Draft Cafe' },
        ownerUserId: userId,
      },
    });
    const r = await resolveStoreReadiness({ userId, draftId: draft.id });
    expect(r.exists).toBe(true);
    expect(r.readinessState).toBe(STORE_READINESS.DRAFT_READY);
    expect(r.guidanceMessage).toMatch(/publish/i);
    expect(r.recommendedActions).toContain('publish_store');
  });

  it('published store → campaign suggestions', async () => {
    const store = await prisma.business.create({
      data: {
        userId,
        name: 'Published Cafe',
        type: 'retail',
        slug: `pub-${Date.now()}`,
        publishedAt: new Date(),
      },
    });
    const r = await resolveStoreReadiness({ userId, storeId: store.id });
    expect(r.exists).toBe(true);
    expect(r.readinessState).toBe(STORE_READINESS.PUBLISHED);
    expect(r.recommendedActions).toContain('launch_campaign');
  });

  it('active store with products → scaling suggestions', async () => {
    const store = await prisma.business.create({
      data: {
        userId,
        name: 'Active Cafe',
        type: 'retail',
        slug: `active-${Date.now()}`,
        publishedAt: new Date(),
      },
    });
    await prisma.product.create({
      data: {
        businessId: store.id,
        name: 'Latte',
        price: 500,
        currency: 'USD',
      },
    });
    const r = await resolveStoreReadiness({ userId, storeId: store.id });
    expect(r.readinessState).toBe(STORE_READINESS.ACTIVE);
    expect(r.recommendedActions).toContain('review_store_performance');
  });

  it('session: after store mission completes, needsStoreFirst is false with draft_ready guidance', async () => {
    const store = await prisma.business.create({
      data: {
        userId,
        name: 'Mission Store',
        type: 'retail',
        slug: `mission-${Date.now()}`,
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
        createdBy: userId,
      },
    });
    await prisma.missionPipeline.create({
      data: {
        type: 'store',
        title: 'Create store: Mission Store',
        status: 'completed',
        runState: 'done',
        targetType: 'store',
        targetId: store.id,
        createdBy: userId,
      },
    });

    const session = await resolveActiveRuntimeSession({
      userId,
      requestedMissionId: mission.id,
      source: 'test',
    });

    expect(session.needsStoreFirst).toBe(false);
    expect(session.activeStoreId).toBe(store.id);
    expect(session.targetReadiness?.exists).toBe(true);
    expect(session.targetReadiness?.readinessState).toBe(STORE_READINESS.DRAFT_READY);
    expect(session.readinessGuidance).toMatch(/publish/i);
  });

  it('switching stores updates readiness via target API', async () => {
    const pub = await prisma.business.create({
      data: {
        userId,
        name: 'Pub',
        type: 'retail',
        slug: `sw-pub-${Date.now()}`,
        publishedAt: new Date(),
      },
    });
    const draft = await prisma.business.create({
      data: {
        userId,
        name: 'Draft Only',
        type: 'retail',
        slug: `sw-draft-${Date.now()}`,
      },
    });
    const pubReady = await resolveTargetReadiness({ userId, targetType: 'store', targetId: pub.id });
    const draftReady = await resolveTargetReadiness({ userId, targetType: 'store', targetId: draft.id });
    expect(pubReady.readinessState).toBe(STORE_READINESS.PUBLISHED);
    expect(draftReady.readinessState).toBe(STORE_READINESS.DRAFT_READY);
  });
});
