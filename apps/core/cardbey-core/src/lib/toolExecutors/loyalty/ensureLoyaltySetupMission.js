/**
 * Ensure a guided mission exists for loyalty setup + persist stepOutputs for resume.
 */

import { getPrismaClient } from '../../prisma.js';
import { createMissionPipeline } from '../../missionPipelineService.js';
import { advanceProactivePipelineStep } from '../../orchestrator/advanceProactivePipelineStep.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {{
 *   missionId?: string | null;
 *   storeId: string;
 *   userId: string;
 *   tenantId?: string | null;
 *   storeName?: string | null;
 *   source?: string;
 * }} params
 */
export async function ensureLoyaltySetupMission(params) {
  const existingId = pickString(params.missionId);
  if (existingId) return { missionId: existingId, created: false };

  const storeId = pickString(params.storeId);
  const userId = pickString(params.userId);
  const tenantId = pickString(params.tenantId, userId);
  const storeName = pickString(params.storeName, 'Store');
  const source = pickString(params.source, 'performer_quick_action');

  const mission = await createMissionPipeline({
    type: 'loyalty_setup',
    title: 'Setup loyalty program',
    targetType: 'store',
    targetId: storeId,
    targetLabel: storeName,
    createdBy: userId,
    tenantId,
    requiresConfirmation: true,
    executionMode: 'GUIDED_RUN',
    metadata: {
      storeId,
      source,
      intentType: 'setup_loyalty_program',
      proactivePlan: {
        total: 1,
        steps: [{ step: 1, title: 'Setup loyalty program', recommendedTool: 'setup_loyalty_program' }],
      },
    },
  });

  return { missionId: mission.id, created: true };
}

/**
 * @param {{ missionId: string, output: object, storeId?: string | null }} params
 */
export async function persistLoyaltySetupStepOutput(params) {
  const missionId = pickString(params.missionId);
  const output = params.output && typeof params.output === 'object' ? params.output : {};
  if (!missionId) return { ok: false };

  const prisma = getPrismaClient();
  const row = await prisma.missionPipeline
    .findUnique({ where: { id: missionId }, select: { metadataJson: true, executionMode: true } })
    .catch(() => null);
  if (!row) return { ok: false, code: 'NOT_FOUND' };

  const meta =
    row.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
      ? row.metadataJson
      : {};
  const stepOutputs =
    meta.stepOutputs && typeof meta.stepOutputs === 'object' && !Array.isArray(meta.stepOutputs)
      ? meta.stepOutputs
      : {};

  const phase = pickString(output.phase);
  const blocksTerminal = phase === 'awaiting_owner_review';
  const nextMeta = {
    ...meta,
    storeId: pickString(params.storeId, output.storeId, meta.storeId),
    proactivePlan: meta.proactivePlan ?? {
      total: 1,
      steps: [{ step: 1, title: 'Setup loyalty program', recommendedTool: 'setup_loyalty_program' }],
    },
    stepOutputs: {
      ...stepOutputs,
      setup_loyalty_program: output,
    },
  };

  const adv = await advanceProactivePipelineStep(prisma, {
    missionId,
    executionMode: row.executionMode,
    data: {
      status: blocksTerminal ? 'executing' : phase === 'applied' ? 'completed' : 'executing',
      runState: blocksTerminal ? 'idle' : phase === 'applied' ? 'done' : 'idle',
      progressTotalSteps: 1,
      progressCompletedSteps: phase === 'applied' ? 1 : 0,
      metadataJson: nextMeta,
    },
    source: 'setup_loyalty_program_runtime',
    correlationId: missionId,
  });

  return adv;
}
