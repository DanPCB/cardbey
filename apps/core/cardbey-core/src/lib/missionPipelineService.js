/**
 * Mission Pipeline v1: create, approve, cancel, retry, resume.
 * All transitions go through canTransitionMissionPipeline.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { canTransitionMissionPipeline } from './missionPipelineTransitions.js';
import { buildDefaultMissionSteps } from './missionPipelineSteps.js';
import { getTaskGraphFromMetadata } from './agentPlanning/taskGraphPersistence.js';
import { materializeStepsFromTaskGraph } from './agentPlanning/taskGraphMaterialize.js';

const TERMINAL_STATUSES = ['completed', 'cancelled'];

/**
 * @param {object} params
 * @param {string} params.type
 * @param {string} params.title
 * @param {string} params.targetType
 * @param {string} [params.targetId]
 * @param {string} [params.targetLabel]
 * @param {object} [params.metadata]
 * @param {boolean} [params.requiresConfirmation]
 * @param {string} [params.tenantId]
 * @param {string} [params.createdBy]
 * @param {'AUTO_RUN'|'GUIDED_RUN'} [params.executionMode] — default AUTO_RUN
 * @returns {Promise<{ id: string, status: string, stepsCreated: number }>}
 */
export async function createMissionPipeline(params) {
  const prisma = getPrismaClient();
  const {
    type,
    title,
    targetType,
    targetId = '',
    targetLabel,
    metadata = {},
    requiresConfirmation = false,
    tenantId = null,
    createdBy = null,
    executionMode = 'AUTO_RUN',
  } = params;
  const mode = executionMode === 'GUIDED_RUN' ? 'GUIDED_RUN' : 'AUTO_RUN';

  // Performer-driven mission types must always go to awaiting_confirmation so
  // runMissionUntilBlocked does not auto-complete them before the performer drives
  // steps via the proactive-step / proactive-confirm routes.
  // MissionPipelineStep records for these types are execution metadata only —
  // the performer owns actual execution authority.
  // PERFORMER_DRIVEN_TYPES: mission types where MissionPipelineStep records are execution
  // metadata only. Actual step execution is owned by performerProactiveStepRoutes.js.
  // Adding a type here prevents runMissionUntilBlocked from auto-completing the mission
  // before the performer drives it. See docs/ORCHESTRATION_AUTHORITY_CONFLICTS_AUDIT.md §6
  const PERFORMER_DRIVEN_TYPES = new Set(['launch_campaign', 'create_promotion', 'code_fix']);
  const effectiveRequiresConfirmation =
    Boolean(requiresConfirmation) || PERFORMER_DRIVEN_TYPES.has(String(type).trim());

  const mission = await prisma.missionPipeline.create({
    data: {
      type: String(type).trim() || 'generic',
      title: String(title).trim() || 'Untitled mission',
      targetType: String(targetType).trim() || 'generic',
      targetId: targetId != null ? String(targetId) : null,
      targetLabel: targetLabel != null ? String(targetLabel).trim() || null : null,
      status: 'requested',
      runState: 'idle',
      executionMode: mode,
      tenantId,
      createdBy,
      requiresConfirmation: effectiveRequiresConfirmation,
      metadataJson: metadata && typeof metadata === 'object' ? metadata : {},
      progressCompletedSteps: 0,
      progressTotalSteps: 0,
    },
  });

  // Shadow Mission row: MissionBlackboard + AgentRun FK to Mission.id; pipeline id matches Mission.id.
  // IMPORTANT: Mission.createdByUserId has a FK → User.id. In guest + business-tenant contexts,
  // fallbacks like "temp" or a businessId will violate the FK. Since MissionPipeline is the source of truth
  // for the pipeline routes, we treat this as best-effort and only upsert when createdBy is a real User.id.
  const tenantFallback =
    (tenantId != null && String(tenantId).trim()) ||
    (createdBy != null && String(createdBy).trim()) ||
    'temp';
  const createdByTrimmed = createdBy != null ? String(createdBy).trim() : '';
  const isPlaceholder = createdByTrimmed === 'temp' || createdByTrimmed === 'dev-user-id' || createdByTrimmed === '';
  let isRealUserId = false;
  if (!isPlaceholder) {
    const existingUser = await prisma.user
      .findUnique({ where: { id: createdByTrimmed }, select: { id: true } })
      .catch(() => null);
    isRealUserId = Boolean(existingUser?.id);
  }
  if (isRealUserId) {
    try {
      await prisma.mission.upsert({
        where: { id: mission.id },
        create: {
          id: mission.id,
          tenantId: tenantFallback,
          createdByUserId: createdByTrimmed,
          title: mission.title != null ? String(mission.title).trim() || null : null,
          status: 'active',
        },
        update: {},
      });
    } catch (err) {
      console.warn('[missionPipelineService] shadow Mission upsert failed (non-fatal):', err?.message || err);
    }
  } else if (process.env.NODE_ENV !== 'production') {
    console.log('[missionPipelineService] skipping shadow Mission upsert (no real user):', {
      missionId: mission.id,
      tenantId: tenantFallback,
      createdBy: createdByTrimmed || null,
    });
  }

  let stepConfigs = buildDefaultMissionSteps(mission.type, metadata);
  const plannedGraph = getTaskGraphFromMetadata(metadata);
  if (plannedGraph) {
    const fromGraph = materializeStepsFromTaskGraph(plannedGraph);
    if (fromGraph.length > 0) stepConfigs = fromGraph;
  }
  if (!Array.isArray(stepConfigs) || stepConfigs.length === 0) {
    const t = typeof mission.type === 'string' ? mission.type.trim().toLowerCase() : '';
    switch (t) {
      case 'launch_campaign':
        stepConfigs = [
          { toolName: 'market_research', label: 'Research', orderIndex: 0 },
          { toolName: 'consensus', label: 'Consensus', orderIndex: 1 },
          { toolName: 'analyze_store', label: 'Analysis', orderIndex: 2 },
          { toolName: 'create_promotion', label: 'Promotion', orderIndex: 3 },
          { toolName: 'activate_promotion', label: 'Activation', orderIndex: 4 },
          { toolName: 'content_creator', label: 'Content', orderIndex: 5 },
          { toolName: 'crm', label: 'CRM', orderIndex: 6 },
        ];
        break;
      case 'rewrite_descriptions':
        stepConfigs = [
          { toolName: 'analyze_store', label: 'Analysing your products', orderIndex: 0 },
          { toolName: 'rewrite_descriptions', label: 'Rewriting descriptions', orderIndex: 1 },
        ];
        break;
      case 'generate_tags':
        stepConfigs = [
          { toolName: 'analyze_store', label: 'Analysing your products', orderIndex: 0 },
          { toolName: 'generate_tags', label: 'Generating tags', orderIndex: 1 },
        ];
        break;
      case 'generate_social':
        stepConfigs = [
          { toolName: 'analyze_store', label: 'Analysing your store', orderIndex: 0 },
          { toolName: 'generate_social_posts', label: 'Creating social posts', orderIndex: 1 },
        ];
        break;
      case 'create_offer':
        stepConfigs = [
          { toolName: 'analyze_store', label: 'Checking your store', orderIndex: 0 },
          { toolName: 'create_offer', label: 'Creating offer', orderIndex: 1 },
          { toolName: 'assign_promotion_slot', label: 'Activating offer', orderIndex: 2 },
        ];
        break;
      case 'improve_hero':
        stepConfigs = [
          { toolName: 'analyze_store', label: 'Analysing your store', orderIndex: 0 },
          { toolName: 'improve_hero', label: 'Updating hero section', orderIndex: 1 },
        ];
        break;
      default:
        break;
    }
  }
  let stepsCreated = 0;
  if (stepConfigs.length > 0) {
    await prisma.missionPipelineStep.createMany({
      data: stepConfigs.map((c) => ({
        missionId: mission.id,
        orderIndex: c.orderIndex,
        toolName: c.toolName,
        label: c.label,
        status: 'pending',
        ...(c.inputJson != null && typeof c.inputJson === 'object' ? { inputJson: c.inputJson } : {}),
      })),
    });
    stepsCreated = stepConfigs.length;
    await prisma.missionPipeline.update({
      where: { id: mission.id },
      data: { progressTotalSteps: stepsCreated },
    });
  } else if (mode === 'AUTO_RUN') {
    // AUTO_RUN missions may execute a single autonomous job without pipeline step rows.
    // Represent this as a 0/1 → 1/1 progress arc (without fabricating MissionPipelineStep rows).
    await prisma.missionPipeline.update({
      where: { id: mission.id },
      data: { progressTotalSteps: 1, progressCompletedSteps: 0 },
    });
  }

  // requested -> planned
  if (!canTransitionMissionPipeline('requested', 'planned')) {
    return { id: mission.id, status: mission.status, stepsCreated };
  }
  await prisma.missionPipeline.update({
    where: { id: mission.id },
    data: { status: 'planned' },
  });

  const nextStatus = effectiveRequiresConfirmation ? 'awaiting_confirmation' : 'queued';
  if (!canTransitionMissionPipeline('planned', nextStatus)) {
    return { id: mission.id, status: 'planned', stepsCreated };
  }
  await prisma.missionPipeline.update({
    where: { id: mission.id },
    data: { status: nextStatus },
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Mission] created: ${mission.id} type=${mission.type}`);
    console.log(`[Mission] transition: requested -> planned mission=${mission.id}`);
    console.log(`[Mission] transition: planned -> ${nextStatus} mission=${mission.id}`);
    if (stepsCreated > 0) console.log(`[MissionSteps] built default steps: ${stepsCreated} for type=${mission.type}`);
  }

  return {
    id: mission.id,
    status: nextStatus,
    stepsCreated,
  };
}

/**
 * @param {string} missionId
 * @param {string} fromStatus
 * @param {string} toStatus
 * @param {object} [extra]
 * @returns {Promise<boolean>} true if updated
 */
async function transitionMission(missionId, fromStatus, toStatus, extra = {}) {
  const prisma = getPrismaClient();
  if (!canTransitionMissionPipeline(fromStatus, toStatus)) return false;
  const data = { status: toStatus, ...extra };
  if (toStatus === 'cancelled') data.cancelledAt = new Date();
  if (toStatus === 'completed') data.completedAt = new Date();
  if (toStatus === 'failed') data.failedAt = new Date();
  await prisma.missionPipeline.update({
    where: { id: missionId },
    data,
  });
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Mission] transition: ${fromStatus} -> ${toStatus} mission=${missionId}`);
  }
  return true;
}

/**
 * @param {string} missionId
 * @returns {Promise<{ ok: boolean, status?: string, error?: string }>}
 */
export async function approveMissionPipeline(missionId) {
  const prisma = getPrismaClient();
  const m = await prisma.missionPipeline.findUnique({ where: { id: missionId }, select: { status: true } });
  if (!m) return { ok: false, error: 'not_found' };
  if (m.status !== 'awaiting_confirmation') return { ok: false, error: 'invalid_state', status: m.status };
  const updated = await transitionMission(missionId, 'awaiting_confirmation', 'queued');
  if (!updated) return { ok: false, error: 'transition_failed' };
  if (process.env.NODE_ENV !== 'production') console.log('[MissionAPI] approve');
  return { ok: true, status: 'queued' };
}

/**
 * @param {string} missionId
 * @returns {Promise<{ ok: boolean, status?: string, error?: string }>}
 */
export async function cancelMissionPipeline(missionId) {
  const prisma = getPrismaClient();
  const m = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: { status: true, outputsJson: true },
  });
  if (!m) return { ok: false, error: 'not_found' };
  if (TERMINAL_STATUSES.includes(m.status)) return { ok: false, error: 'already_terminal', status: m.status };
  const updated = await transitionMission(missionId, m.status, 'cancelled', { runState: 'cancelled' });
  if (!updated) return { ok: false, error: 'transition_failed' };
  if (process.env.NODE_ENV !== 'production') console.log('[MissionAPI] cancel');

  const out = m.outputsJson && typeof m.outputsJson === 'object' ? m.outputsJson : {};
  const jobId = typeof out.jobId === 'string' && out.jobId.trim() ? out.jobId.trim() : null;
  if (jobId) {
    try {
      const { transitionOrchestratorTaskStatus } = await import('../kernel/transitions/transitionService.js');
      await transitionOrchestratorTaskStatus({
        prisma,
        taskId: jobId,
        toStatus: 'failed',
        fromStatus: 'running',
        actorType: 'system',
        correlationId: missionId,
        reason: 'MISSION_PIPELINE_CANCELLED',
        result: { ok: false, cancelled: true, missionPipelineId: missionId },
      });
      await transitionOrchestratorTaskStatus({
        prisma,
        taskId: jobId,
        toStatus: 'failed',
        fromStatus: 'queued',
        actorType: 'system',
        correlationId: missionId,
        reason: 'MISSION_PIPELINE_CANCELLED',
        result: { ok: false, cancelled: true, missionPipelineId: missionId },
      });
    } catch (e) {
      console.warn('[cancelMissionPipeline] orchestrator task cancel:', e?.message || e);
    }
  }

  return { ok: true, status: 'cancelled' };
}

/**
 * @param {string} missionId
 * @returns {Promise<{ ok: boolean, status?: string, error?: string }>}
 */
export async function retryMissionPipeline(missionId) {
  const prisma = getPrismaClient();
  const m = await prisma.missionPipeline.findUnique({ where: { id: missionId }, select: { status: true } });
  if (!m) return { ok: false, error: 'not_found' };
  if (m.status !== 'failed') return { ok: false, error: 'invalid_state', status: m.status };
  const updated = await transitionMission(missionId, 'failed', 'queued');
  if (!updated) return { ok: false, error: 'transition_failed' };
  if (process.env.NODE_ENV !== 'production') console.log('[MissionAPI] retry');
  return { ok: true, status: 'queued' };
}

/**
 * @param {string} missionId
 * @returns {Promise<{ ok: boolean, status?: string, error?: string }>}
 */
export async function resumeMissionPipeline(missionId) {
  const prisma = getPrismaClient();
  const m = await prisma.missionPipeline.findUnique({ where: { id: missionId }, select: { status: true } });
  if (!m) return { ok: false, error: 'not_found' };
  if (m.status !== 'paused') return { ok: false, error: 'invalid_state', status: m.status };
  const updated = await transitionMission(missionId, 'paused', 'queued');
  if (!updated) return { ok: false, error: 'transition_failed' };
  if (process.env.NODE_ENV !== 'production') console.log('[MissionAPI] resume');
  return { ok: true, status: 'queued' };
}

/**
 * When the pipeline is queued but has no pending steps (e.g. create-store with no stepToolNames),
 * mark the mission completed so the client gets a terminal state and stops polling.
 *
 * @param {string} missionId
 * @returns {Promise<boolean>} true if transition was applied
 */
export async function completeMissionWhenNoSteps(missionId) {
  const prisma = getPrismaClient();
  const m = await prisma.missionPipeline.findUnique({ where: { id: missionId }, select: { status: true } });
  if (!m || m.status !== 'queued') return false;
  const updated = await transitionMission(missionId, 'queued', 'completed', { runState: 'done' });
  if (updated && process.env.NODE_ENV !== 'production') {
    console.log('[MissionAPI] completed (no pending steps) mission=', missionId);
  }
  return updated;
}

/**
 * Pause shadow Mission row (agent-chat registry) while waiting for user approval (e.g. website patch).
 * @param {string} missionId
 * @param {unknown} [reason] e.g. metadata object from miniWebsiteAgent proposer
 * @returns {Promise<{ ok: boolean, missionId?: string, status?: string, error?: string }>}
 */
export async function pauseMissionPipeline(missionId, reason) {
  console.log('[MissionPipeline] Pause:', missionId, reason);
  try {
    const { getPrismaClient } = await import('../lib/prisma.js');
    const prisma = getPrismaClient();
    await prisma.mission.update({
      where: { id: missionId },
      data: { status: 'paused' },
    });
    return { ok: true, missionId, status: 'paused' };
  } catch (e) {
    console.warn('[MissionPipeline] pauseMissionPipeline error:', e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}
