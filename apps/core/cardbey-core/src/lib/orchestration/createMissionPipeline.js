/**
 * Orchestration-scoped mission pipeline creation with confirmation gating.
 */

import { createMissionPipeline } from '../missionPipelineService.js';
import { Features } from '../../config/features.js';
import {
  ORCHESTRATION_MISSION_TYPES,
  createOrchestrationGovernanceTrace,
  appendOrchestrationGovernanceTrace,
} from './multiAgentGovernance.js';

/**
 * Create a multi-agent / campaign orchestration pipeline.
 * When confirmation is required and not yet granted, pipeline stays in awaiting_confirmation
 * and must not be auto-run until the user confirms.
 *
 * @param {Parameters<typeof createMissionPipeline>[0] & {
 *   confirmed?: boolean;
 *   skipConfirmation?: boolean;
 *   governanceTrace?: Record<string, unknown>;
 *   sourceIntent?: string;
 * }} params
 */
export async function createOrchestrationMissionPipeline(params) {
  const {
    confirmed = false,
    skipConfirmation = false,
    governanceTrace,
    sourceIntent,
    type,
    metadata = {},
    requiresConfirmation: requiresConfirmationParam,
    executionMode: executionModeParam,
    ...rest
  } = params;

  const missionType = String(type ?? '').trim();
  const gateEnabled = Features.multiAgent.requireConfirmation;
  const orchestrationType = ORCHESTRATION_MISSION_TYPES.has(missionType);

  const effectiveRequiresConfirmation =
    requiresConfirmationParam === true ||
    (gateEnabled &&
      orchestrationType &&
      !skipConfirmation &&
      !confirmed &&
      requiresConfirmationParam !== false);

  const executionMode =
    executionModeParam ??
    (effectiveRequiresConfirmation ? 'GUIDED_RUN' : 'AUTO_RUN');

  const trace =
    governanceTrace ??
    createOrchestrationGovernanceTrace({
      sourceIntent: sourceIntent ?? metadata.goal ?? rest.title ?? missionType,
      missionId: rest.id ?? null,
      targetId: rest.targetId ?? metadata.storeId ?? null,
      proposedAction: 'multi_agent_orchestration',
      confirmationState: effectiveRequiresConfirmation
        ? 'pending'
        : confirmed
          ? 'confirmed'
          : 'not_required',
      executedBy: rest.createdBy ?? null,
      missionType,
    });

  appendOrchestrationGovernanceTrace(trace);

  const metadataJson = {
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
    safeExecutionTrace: trace,
    multiAgentStatus: effectiveRequiresConfirmation ? 'pending_approval' : 'approved',
  };

  return createMissionPipeline({
    ...rest,
    type: missionType,
    metadata: metadataJson,
    requiresConfirmation: effectiveRequiresConfirmation,
    executionMode,
  });
}

const ORCHESTRATION_PIPELINE_TYPES = new Set(['multi_agent', 'campaign_orchestration']);

/**
 * @param {string} pipelineId
 */
export async function getOrchestrationPipelineStatus(pipelineId) {
  const id = String(pipelineId ?? '').trim();
  if (!id) return null;

  const { getPrismaClient } = await import('../prisma.js');
  const prisma = getPrismaClient();
  const row = await prisma.missionPipeline.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      status: true,
      requiresConfirmation: true,
      metadataJson: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!row) return null;

  const meta =
    row.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
      ? row.metadataJson
      : {};
  const trace = meta.safeExecutionTrace ?? null;

  return {
    id: row.id,
    type: row.type,
    status: row.status,
    requiresConfirmation: row.requiresConfirmation === true,
    multiAgentStatus: meta.multiAgentStatus ?? null,
    confirmed: row.status !== 'awaiting_confirmation',
    confirmedBy: trace?.executedBy ?? null,
    confirmedAt: trace?.confirmationState === 'confirmed' ? trace?.timestamp ?? null : null,
    proposedAction: trace?.proposedAction ?? 'multi_agent_orchestration',
    governanceTrace: trace,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Confirm a pending orchestration pipeline and start execution.
 *
 * @param {string} pipelineId
 * @param {string | null | undefined} userId
 */
export async function confirmOrchestrationPipeline(pipelineId, userId) {
  const id = String(pipelineId ?? '').trim();
  if (!id) {
    throw new Error('pipelineId required');
  }

  const pipeline = await getOrchestrationPipelineStatus(id);
  if (!pipeline) {
    throw new Error(`Pipeline ${id} not found`);
  }
  if (!ORCHESTRATION_PIPELINE_TYPES.has(String(pipeline.type ?? '').trim())) {
    throw new Error(`Pipeline ${id} is not an orchestration mission`);
  }
  if (pipeline.status !== 'awaiting_confirmation') {
    throw new Error(`Pipeline ${id} is not pending approval`);
  }

  const trace = appendOrchestrationGovernanceTrace(
    createOrchestrationGovernanceTrace({
      sourceIntent: pipeline.governanceTrace?.sourceIntent ?? pipeline.type,
      missionId: id,
      proposedAction: pipeline.proposedAction ?? 'multi_agent_orchestration',
      confirmationState: 'confirmed',
      executedBy: userId ?? null,
      missionType: pipeline.type,
    }),
  );

  const { getPrismaClient } = await import('../prisma.js');
  const prisma = getPrismaClient();
  const existing = await prisma.missionPipeline.findUnique({
    where: { id },
    select: { metadataJson: true },
  });
  const meta =
    existing?.metadataJson && typeof existing.metadataJson === 'object' && !Array.isArray(existing.metadataJson)
      ? existing.metadataJson
      : {};

  await prisma.missionPipeline.update({
    where: { id },
    data: {
      metadataJson: {
        ...meta,
        safeExecutionTrace: trace,
        multiAgentStatus: 'approved',
      },
    },
  });

  const { approveMissionPipeline } = await import('../missionPipelineService.js');
  const approved = await approveMissionPipeline(id);
  if (!approved.ok) {
    throw new Error(approved.error ?? 'Failed to approve pipeline');
  }

  const { runMissionUntilBlocked } = await import('../missionPipelineOrchestrator.js');
  const orchestration = await runMissionUntilBlocked(id);

  return {
    ...pipeline,
    status: orchestration.status ?? 'queued',
    confirmed: true,
    confirmedBy: userId ?? null,
    confirmedAt: trace.timestamp,
    governanceTrace: trace,
    orchestration: {
      stepsRun: orchestration.stepsRun,
      stoppedReason: orchestration.stoppedReason,
    },
  };
}
