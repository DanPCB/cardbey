import { getPrismaClient } from '../src/lib/prisma.js';
import { createMissionPipeline } from '../src/lib/missionPipelineService.js';
import { ensureStructuredStoreCheckpointSteps } from '../src/lib/storeMission/ensureStructuredStoreCheckpointSteps.js';
import { executeStoreMissionPipelineRun } from '../src/lib/storeMission/executeStoreMissionPipelineRun.js';

const prisma = getPrismaClient();
try {
  const user = await prisma.user.findFirst({
    where: { email: { contains: 'sumsign' } },
    select: { id: true, email: true },
  });
  console.log('user', user?.id, user?.email);
  if (!user) throw new Error('no user');

  const stamp = Date.now();
  const pipeline = await createMissionPipeline({
    type: 'store',
    title: `Create store: audit test cafe ${stamp}`,
    targetType: 'store',
    metadata: {
      businessName: 'audit test cafe',
      businessType: 'Food & drink',
      location: 'Melbourne',
      source: 'audit_script',
      idempotencyKey: `audit-${Date.now()}`,
    },
    requiresConfirmation: true,
    executionMode: 'AUTO_RUN',
    tenantId: user.id,
    createdBy: user.id,
  });
  console.log('created', pipeline.id, pipeline.status);

  await ensureStructuredStoreCheckpointSteps(prisma, pipeline.id, { logPrefix: '[audit]' });

  const runResult = await executeStoreMissionPipelineRun({
    prisma,
    user: { id: user.id },
    missionId: pipeline.id,
    body: {
      businessName: 'audit test cafe',
      businessType: 'Food & drink',
      location: 'Melbourne',
      intentMode: 'store',
    },
    auditSource: 'audit_script',
  });
  console.log('runResult', JSON.stringify(runResult, null, 2));
} finally {
  await prisma.$disconnect();
}
