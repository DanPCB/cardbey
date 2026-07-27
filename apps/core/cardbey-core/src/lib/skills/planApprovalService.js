/**
 * Plan approval pause/resume — blackboard persistence and decision handling.
 */

import {
  appendEvent,
  getEvents,
  setBlackboardKey,
} from '../missionBlackboard.js';
import { getPrismaClient } from '../prisma.js';
import { broadcastMissionPlanApproval } from '../../realtime/simpleSse.js';
import {
  BLACKBOARD_KEY_PLAN_DECIDED,
  BLACKBOARD_KEY_PLAN_PENDING,
  PLAN_EVENT_DECIDED,
  PLAN_EVENT_READY,
  SKILL_STATUS_AWAITING_PLAN_APPROVAL,
  SKIP_PLAN_PREVIEW_PATTERN,
} from './planApprovalConstants.js';
import { validatePlanArtifact, extractVideoPlanFromStepOutput } from './planApprovalSchema.js';
import {
  PENDING_SKILL_PLAN_APPROVAL,
  buildPendingSkillMissionContext,
  pickPlanApprovalPendingInputs,
} from '../intake/pendingSkillResume.js';

/**
 * @param {import('./types.js').SkillDefinition} skillDef
 * @param {object} ctx
 * @returns {boolean}
 */
export function shouldPlanFirst(skillDef, ctx) {
  const planning = skillDef?.planning;
  if (!planning?.planFirst) return false;
  if (ctx?.approvedPlan) return false;

  const userMessage = String(ctx?.toolInput?.userMessage ?? ctx?.intent ?? '').trim();
  const wantsSkip = SKIP_PLAN_PREVIEW_PATTERN.test(userMessage);
  if (wantsSkip && !planning.expensive) return false;
  return true;
}

/**
 * @param {import('./types.js').SkillDefinition} skillDef
 * @param {import('./types.js').SkillExecution} execution
 * @returns {object | null}
 */
export function buildPlanArtifactFromExecution(skillDef, execution) {
  const planning = skillDef?.planning;
  const planStepId = planning?.planStepId ?? 'video_plan';
  const stepResult = execution.stepResults?.[planStepId];
  if (!stepResult?.ok) return null;
  return extractVideoPlanFromStepOutput(stepResult) ?? stepResult?.output?.plan ?? null;
}

/**
 * @param {import('./types.js').SkillDefinition} skillDef
 * @param {number} stepIndex
 * @returns {boolean}
 */
export function isPlanPhaseComplete(skillDef, stepIndex) {
  const planning = skillDef?.planning;
  if (!planning?.planFirst) return false;
  const steps = skillDef.steps ?? [];
  const step = steps[stepIndex];
  if (!step) return false;
  const planStepId = planning.planStepId ?? step.id;
  return step.id === planStepId || step.tool === planning.planExecutor;
}

/**
 * @param {import('./types.js').SkillDefinition} skillDef
 * @param {number} stepIndex
 * @returns {boolean}
 */
export function hasExecuteStepRemaining(skillDef, stepIndex) {
  const executeStepId = skillDef?.planning?.executeStepId;
  if (!executeStepId) return stepIndex + 1 < (skillDef.steps?.length ?? 0);
  return (skillDef.steps ?? []).some((s, i) => i > stepIndex && s.id === executeStepId);
}

/**
 * @param {{
 *   missionId: string,
 *   execution: import('./types.js').SkillExecution,
 *   skillDef: import('./types.js').SkillDefinition,
 *   planArtifact: object,
 * }} args
 */
export async function persistPlanApprovalPending({ missionId, execution, skillDef, planArtifact }) {
  const mid = String(missionId ?? '').trim();
  if (!mid) return;

  const pending = {
    kind: PENDING_SKILL_PLAN_APPROVAL,
    executionId: execution.id,
    skillName: execution.skillName,
    planSchema: skillDef?.planning?.planSchema ?? null,
    plan: planArtifact,
    executeStepIndex: execution.currentStep + 1,
    createdAt: new Date().toISOString(),
    phase: 'plan_approval',
  };

  await setBlackboardKey(mid, BLACKBOARD_KEY_PLAN_PENDING, pending, { prisma: getPrismaClient() });
  await appendEvent(mid, PLAN_EVENT_READY, {
    executionId: execution.id,
    skillName: execution.skillName,
    planSchema: pending.planSchema,
    plan: planArtifact,
    status: SKILL_STATUS_AWAITING_PLAN_APPROVAL,
  });

  broadcastMissionPlanApproval(mid, {
    executionId: execution.id,
    skillName: execution.skillName,
    planSchema: pending.planSchema,
    plan: planArtifact,
    status: SKILL_STATUS_AWAITING_PLAN_APPROVAL,
  });
}

/**
 * @param {string} missionId
 * @returns {Promise<object | null>}
 */
export async function loadPendingPlanApproval(missionId) {
  const mid = String(missionId ?? '').trim();
  if (!mid) return null;
  try {
    const prisma = getPrismaClient();
    const row = await prisma.missionBlackboardSnapshot?.findFirst?.({
      where: { missionId: mid },
      orderBy: { updatedAt: 'desc' },
    });
    const snap = row?.snapshotJson;
    if (snap && typeof snap === 'object' && snap[BLACKBOARD_KEY_PLAN_PENDING]) {
      return snap[BLACKBOARD_KEY_PLAN_PENDING];
    }
  } catch {
    /* fall through */
  }

  try {
    const result = await getEvents(mid, PLAN_EVENT_READY);
    const list = Array.isArray(result) ? result : result?.events ?? [];
    const latest = list[list.length - 1];
    const payload = latest?.payload ?? latest;
    if (payload?.plan) return payload;
  } catch {
    /* non-fatal */
  }
  return null;
}

/**
 * @param {string} missionId
 * @returns {Promise<object | null>}
 */
export async function loadPlanApprovalDecision(missionId) {
  const mid = String(missionId ?? '').trim();
  if (!mid) return null;
  try {
    const result = await getEvents(mid, PLAN_EVENT_DECIDED);
    const list = Array.isArray(result) ? result : result?.events ?? [];
    return list[list.length - 1]?.payload ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   missionId: string,
 *   userId: string,
 *   decision: 'approve' | 'regenerate' | 'cancel',
 *   editedPlan?: object,
 *   feedback?: string,
 *   executionId?: string,
 *   skillExecutor: import('./SkillExecutor.js').SkillExecutor,
 *   skillRegistry: import('./SkillRegistry.js').SkillRegistry,
 * }} args
 */
export async function handlePlanDecision({
  missionId,
  userId,
  decision,
  editedPlan,
  feedback,
  executionId,
  skillExecutor,
  skillRegistry,
}) {
  const mid = String(missionId ?? '').trim();
  const uid = String(userId ?? '').trim();
  if (!mid || !uid) {
    return { ok: false, error: 'validation', message: 'missionId and userId required' };
  }

  const pending = await loadPendingPlanApproval(mid);
  const execId = String(executionId ?? pending?.executionId ?? '').trim();
  if (!execId) {
    return { ok: false, error: 'not_found', message: 'No pending plan approval for this mission' };
  }

  const priorDecision = await loadPlanApprovalDecision(mid);
  if (
    decision === 'approve' &&
    priorDecision?.decision === 'approve' &&
    priorDecision?.executionId === execId
  ) {
    return { ok: true, duplicate: true, status: priorDecision.status ?? 'executing' };
  }

  const skillName = pending?.skillName ?? 'video_generation';
  const skillDef = skillRegistry.get?.(skillName) ?? skillRegistry.findByName?.(skillName);
  if (!skillDef) {
    return { ok: false, error: 'not_found', message: `Skill not found: ${skillName}` };
  }

  if (decision === 'cancel') {
    await appendEvent(mid, PLAN_EVENT_DECIDED, {
      decision: 'cancel',
      executionId: execId,
      status: 'cancelled',
    });
    await setBlackboardKey(mid, BLACKBOARD_KEY_PLAN_PENDING, null, { prisma: getPrismaClient() });
    await setBlackboardKey(
      mid,
      BLACKBOARD_KEY_PLAN_DECIDED,
      { decision: 'cancel', executionId: execId, at: new Date().toISOString() },
      { prisma: getPrismaClient() },
    );
    broadcastMissionPlanApproval(mid, { status: 'cancelled', executionId: execId });
    return { ok: true, status: 'cancelled' };
  }

  if (decision === 'regenerate') {
    const regenCtx = {
      missionId: mid,
      userId: uid,
      storeId: pending?.plan?.storeId ?? null,
      toolInput: {
        userMessage: [pending?.plan?.autoPrompt ?? '', feedback ?? ''].filter(Boolean).join('\n'),
        feedback: feedback ?? '',
      },
      regeneratePlan: true,
    };
    const execution = await skillExecutor.resume(execId, regenCtx);
    if (execution.status === SKILL_STATUS_AWAITING_PLAN_APPROVAL) {
      const planArtifact = buildPlanArtifactFromExecution(skillDef, execution);
      if (planArtifact) {
        await persistPlanApprovalPending({
          missionId: mid,
          execution,
          skillDef,
          planArtifact,
        });
      }
      return { ok: true, status: SKILL_STATUS_AWAITING_PLAN_APPROVAL, execution, plan: planArtifact };
    }
    return { ok: true, status: execution.status, execution };
  }

  if (decision === 'approve') {
    const schemaId = skillDef?.planning?.planSchema ?? pending?.planSchema;
    const basePlan = pending?.plan ?? {};
    const finalPlan = editedPlan ?? basePlan;
    const validation = validatePlanArtifact(finalPlan, schemaId);
    if (!validation.ok) {
      return { ok: false, error: 'validation', message: 'Invalid plan', details: validation.errors };
    }

    await appendEvent(mid, PLAN_EVENT_DECIDED, {
      decision: 'approve',
      executionId: execId,
      plan: validation.plan,
      status: 'executing',
    });
    await setBlackboardKey(mid, BLACKBOARD_KEY_PLAN_PENDING, null, { prisma: getPrismaClient() });
    await setBlackboardKey(
      mid,
      BLACKBOARD_KEY_PLAN_DECIDED,
      { decision: 'approve', executionId: execId, at: new Date().toISOString() },
      { prisma: getPrismaClient() },
    );

    const execution = await skillExecutor.resume(execId, {
      missionId: mid,
      userId: uid,
      storeId: validation.plan?.storeId ?? pending?.plan?.storeId ?? null,
      approvedPlan: validation.plan,
      toolInput: { userMessage: validation.plan?.autoPrompt ?? '' },
    });

    broadcastMissionPlanApproval(mid, {
      status: execution.status,
      executionId: execId,
      decision: 'approve',
    });

    return { ok: true, status: execution.status, execution, plan: validation.plan };
  }

  return { ok: false, error: 'validation', message: 'Unknown decision' };
}

/**
 * Mission context blob for refresh/disambiguation resume (mirrors document ingestion).
 * @param {object} pending
 */
export function buildPlanApprovalMissionContext(pending) {
  return buildPendingSkillMissionContext(PENDING_SKILL_PLAN_APPROVAL, pickPlanApprovalPendingInputs(pending));
}
