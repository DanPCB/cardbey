/**
 * Ensures MissionPipelineStep rows include structured checkpoint steps for type `launch_campaign`.
 */

import { getStructuredMissionSteps } from '../missionPipelineStructured.js';

/**
 * @param {import('../prismaClient.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {{ logPrefix?: string, locale?: string }} [opts]
 * @returns {Promise<void>}
 */
export async function ensureStructuredCampaignCheckpointSteps(prisma, missionId, opts = {}) {
  const logPrefix =
    typeof opts.logPrefix === 'string' && opts.logPrefix.trim() ? opts.logPrefix.trim() : '[CampaignMission]';
  const locale = typeof opts.locale === 'string' && opts.locale.trim() ? opts.locale.trim() : 'en';

  const existingCheckpointCount = await prisma.missionPipelineStep.count({
    where: { missionId, stepKind: 'checkpoint' },
  });

  if (existingCheckpointCount > 0) {
    console.log(
      `${logPrefix} mission ${missionId} already has ${existingCheckpointCount} checkpoint step(s) — skipping step creation`,
    );
    return;
  }

  const structuredCampaignSteps = getStructuredMissionSteps('launch_campaign', locale);
  if (!Array.isArray(structuredCampaignSteps) || structuredCampaignSteps.length === 0) {
    console.warn(
      `${logPrefix} getStructuredMissionSteps('launch_campaign') returned no steps for mission ${missionId}`,
    );
    return;
  }

  await prisma.missionPipelineStep.deleteMany({ where: { missionId } });
  await prisma.missionPipelineStep.createMany({
    data: structuredCampaignSteps.map((step, index) => ({
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
    data: { progressTotalSteps: structuredCampaignSteps.length },
  });
  console.log(
    `${logPrefix} created ${structuredCampaignSteps.length} structured campaign steps for mission ${missionId}`,
  );
}
