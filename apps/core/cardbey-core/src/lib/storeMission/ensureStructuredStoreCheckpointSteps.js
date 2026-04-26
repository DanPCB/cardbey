/**
 * Ensures MissionPipelineStep rows include structured checkpoint/conditional steps for type `store`.
 * Used before executeStoreMissionPipelineRun so Phase 3 checkpoint routing wins over legacy orchestra build.
 */

import { getStructuredMissionSteps } from '../missionPipelineStructured.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} missionId
 * @param {{ logPrefix?: string }} [opts]
 * @returns {Promise<void>}
 */
export async function ensureStructuredStoreCheckpointSteps(prisma, missionId, opts = {}) {
  const logPrefix = typeof opts.logPrefix === 'string' && opts.logPrefix.trim() ? opts.logPrefix.trim() : '[StoreMission]';
  const existingCheckpointCount = await prisma.missionPipelineStep.count({
    where: { missionId, stepKind: 'checkpoint' },
  });

  if (existingCheckpointCount > 0) {
    console.log(
      `${logPrefix} mission ${missionId} already has ${existingCheckpointCount} checkpoint step(s) — skipping step creation`,
    );
    return;
  }

  const structuredStoreSteps = getStructuredMissionSteps('store');
  if (!Array.isArray(structuredStoreSteps) || structuredStoreSteps.length === 0) {
    console.warn(`${logPrefix} getStructuredMissionSteps('store') returned no steps for mission ${missionId}`);
    return;
  }

  await prisma.missionPipelineStep.deleteMany({ where: { missionId } });
  await prisma.missionPipelineStep.createMany({
    data: structuredStoreSteps.map((step, index) => ({
      missionId,
      orderIndex: step.orderIndex ?? index,
      toolName: step.toolName ?? 'mission.checkpoint',
      label: step.label ?? `Step ${index + 1}`,
      status: 'pending',
      stepKind: step.stepKind ?? 'action',
      configJson: step.configJson ?? null,
      ...(step.inputJson != null && typeof step.inputJson === 'object' ? { inputJson: step.inputJson } : {}),
    })),
  });
  await prisma.missionPipeline.update({
    where: { id: missionId },
    data: { progressTotalSteps: structuredStoreSteps.length },
  });
  console.log(
    `${logPrefix} created ${structuredStoreSteps.length} structured steps for mission ${missionId} (existingCheckpointCount was 0)`,
  );
}
