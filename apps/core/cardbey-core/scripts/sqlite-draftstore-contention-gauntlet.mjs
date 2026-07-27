#!/usr/bin/env node
/**
 * Stress DraftStore.create against concurrent mission read polling patterns.
 *
 * Usage:
 *   node scripts/sqlite-draftstore-contention-gauntlet.mjs
 *
 * PASS: no P1008 / SQLITE_BUSY exhaustion; draft created; mission updated.
 */
import '../src/env/ensureDatabaseUrl.js';
import { getPrismaClient } from '../src/lib/prisma.js';
import { safeDraftStoreCreate } from '../src/lib/safeDraftStoreCreate.js';
import { runCriticalSqliteWriteWithP1008Retry } from '../src/lib/sqliteCriticalWrite.js';
import { appendEvent } from '../src/lib/missionBlackboard.js';
import { createMissionPipeline } from '../src/lib/missionPipelineService.js';

process.env.PERFORMER_SQLITE_RUNTIME_WRITE_SERIALIZATION = 'true';

const POLL_ROUNDS = 24;
const POLL_DELAY_MS = 40;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulatePollingReads(prisma, missionId) {
  for (let i = 0; i < POLL_ROUNDS; i += 1) {
    await Promise.all([
      prisma.missionPipeline.findUnique({
        where: { id: missionId },
        include: { steps: { orderBy: { orderIndex: 'asc' } } },
      }),
      prisma.mission.findUnique({ where: { id: missionId }, select: { context: true } }),
      prisma.missionBlackboard.findMany({
        where: { missionId },
        orderBy: { seq: 'asc' },
        take: 50,
      }).catch(() => []),
    ]);
    await sleep(POLL_DELAY_MS);
  }
}

async function main() {
  const prisma = getPrismaClient();
  const stamp = Date.now();
  const user = await prisma.user.create({
    data: {
      email: `gauntlet-${stamp}@test.local`,
      passwordHash: 'test',
      displayName: 'Gauntlet User',
      roles: '["owner"]',
      role: 'owner',
    },
  });

  let missionId = null;
  let draftId = null;

  try {
    const pipeline = await createMissionPipeline({
      type: 'store',
      title: 'Gauntlet store build',
      targetType: 'store',
      targetId: null,
      metadata: { source: 'sqlite_gauntlet' },
      requiresConfirmation: false,
      executionMode: 'AUTO_RUN',
      tenantId: user.id,
      createdBy: user.id,
    });
    missionId = pipeline.id;

    const pollTask = simulatePollingReads(prisma, missionId);

    const draft = await safeDraftStoreCreate(prisma, {
      data: {
        mode: 'template',
        status: 'generating',
        ownerUserId: user.id,
        input: { prompt: 'Gauntlet cafe', tenantId: user.id, missionId },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      missionId,
      operation: 'gauntlet.draftStore.create',
    });
    draftId = draft.id;

    await runCriticalSqliteWriteWithP1008Retry(
      () =>
        prisma.missionPipeline.update({
          where: { id: missionId },
          data: {
            outputsJson: { draftId, generationRunId: `gauntlet-${stamp}` },
            runState: 'running',
          },
        }),
      { label: 'gauntlet.missionPipeline.update', missionId },
    );

    await runCriticalSqliteWriteWithP1008Retry(
      () => appendEvent(missionId, 'pipeline.step.progress', { step: 'structured_store_build', draftId }),
      { label: 'gauntlet.blackboard.append', missionId },
    );

    await pollTask;

    console.log('[sqlite-draftstore-contention-gauntlet] PASS', {
      missionId,
      draftId,
      createdAt: draft.createdAt?.toISOString?.() ?? draft.createdAt,
    });
    process.exitCode = 0;
  } catch (err) {
    console.error('[sqlite-draftstore-contention-gauntlet] FAIL', err?.message ?? err);
    process.exitCode = 1;
  } finally {
    if (draftId) await prisma.draftStore.delete({ where: { id: draftId } }).catch(() => {});
    if (missionId) {
      await prisma.missionBlackboard.deleteMany({ where: { missionId } }).catch(() => {});
      await prisma.missionPipelineStep.deleteMany({ where: { missionId } }).catch(() => {});
      await prisma.missionPipeline.delete({ where: { id: missionId } }).catch(() => {});
      await prisma.mission.delete({ where: { id: missionId } }).catch(() => {});
    }
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }
}

main();
