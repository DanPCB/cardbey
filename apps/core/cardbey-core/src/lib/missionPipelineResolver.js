/**
 * Mission Pipeline v1: read-only state resolver.
 * resolveMissionState(missionId) returns normalized readable state for MissionConsole / MI Assistant.
 * Enriches state with pipelineConfig (checkpoints) and summaryText from intent registry.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { getPipelineForIntent } from './missionPlan/intentPipelineRegistry.js';
import { getSummaryText } from './missionPlan/missionSummaries.js';

function parseJsonArray(val) {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const a = JSON.parse(val);
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonObject(val) {
  if (val == null) return {};
  if (typeof val === 'object' && !Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const o = JSON.parse(val);
      return o != null && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Compute nextActions from mission status (skeleton: simple suggestions).
 * When queued or executing, include run_next_step for manual/DEV trigger.
 */
function getNextActions(status, runState, { disableRunnerActions = false } = {}) {
  const actions = [];
  switch (status) {
    case 'awaiting_confirmation':
      actions.push('approve', 'cancel');
      break;
    case 'planned':
    case 'queued':
      actions.push('cancel');
      if (!disableRunnerActions) actions.push('run_next_step');
      break;
    case 'executing':
    case 'paused':
      actions.push('cancel');
      if (!disableRunnerActions) actions.push('run_next_step');
      if (status === 'paused') actions.push('resume');
      break;
    case 'failed':
      actions.push('retry', 'cancel');
      break;
    default:
      break;
  }
  return actions;
}

/**
 * @param {string} missionId - MissionPipeline id
 * @returns {Promise<object|null>} Normalized state or null if not found
 */
export async function resolveMissionState(missionId) {
  const prisma = getPrismaClient();
  const mission = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    include: {
      steps: { orderBy: { orderIndex: 'asc' } },
    },
  });
  if (!mission) return null;

  const executionMode = mission.executionMode ?? 'AUTO_RUN';
  const isGuided = String(executionMode).trim() === 'GUIDED_RUN';

  const steps = (mission.steps || []).map((s) => ({
    stepId: s.id,
    toolName: s.toolName,
    label: s.label,
    status: s.status,
    ...(s.outputJson != null && typeof s.outputJson === 'object' && { output: s.outputJson }),
    ...(s.errorJson != null && typeof s.errorJson === 'object' && { error: s.errorJson }),
  }));

  let currentStep = null;
  if (mission.currentStepId) {
    const cs = steps.find((s) => s.stepId === mission.currentStepId);
    if (cs) currentStep = cs;
  }
  if (!currentStep) {
    const running = steps.find((s) => s.status === 'running');
    if (running) currentStep = running;
  }

  const total = mission.progressTotalSteps || 0;
  const completed = mission.progressCompletedSteps ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  const blockers = parseJsonArray(mission.blockersJson);
  const warnings = parseJsonArray(mission.warningsJson);
  const outputs = parseJsonObject(mission.outputsJson);
  const metadata = parseJsonObject(mission.metadataJson);
  const disableRunnerActions =
    metadata && typeof metadata.source === 'string' && metadata.source.trim() === 'performer_intake_proactive_plan';
  const nextActions = getNextActions(mission.status, mission.runState, { disableRunnerActions });

  const pipeline = getPipelineForIntent(mission.type);
  const pipelineConfig = {
    checkpoints: Array.isArray(pipeline.checkpoints) ? pipeline.checkpoints : [],
  };
  const summaryText = getSummaryText(pipeline.summaryKey);

  const lastCompletedStep = steps.length > 0 ? steps.filter((s) => s.status === 'completed').pop() : null;
  const lastResult =
    lastCompletedStep && lastCompletedStep.output != null
      ? { intentType: mission.type, output: lastCompletedStep.output }
      : outputs?.lastResult ?? undefined;

  return {
    missionId: mission.id,
    type: mission.type,
    title: mission.title,
    status: mission.status,
    runState: mission.runState,
    executionMode,
    // Campaign output contract is only meaningful for GUIDED_RUN campaign runway missions.
    // AUTO_RUN store/website missions should never surface "incomplete outputs" warnings.
    outputQuality: isGuided ? undefined : 'valid',
    campaignIncomplete: isGuided ? undefined : false,
    target: {
      type: mission.targetType,
      id: mission.targetId ?? undefined,
      label: mission.targetLabel ?? undefined,
    },
    progress: {
      completedSteps: completed,
      totalSteps: total,
      percent,
    },
    currentStep,
    blockers,
    warnings,
    nextActions,
    steps,
    outputs,
    pipelineConfig,
    summaryText,
    lastResult,
    /** Full pipeline metadata (e.g. proactive runway `stepOutputs`) for console restore. */
    metadata,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
  };
}
