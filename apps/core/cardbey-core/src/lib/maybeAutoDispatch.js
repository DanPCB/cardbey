/**
 * Auto-chaining: maybe dispatch the next agent run when safe.
 * Risk policy: manual=never; auto_safe=R0/R1 only; auto_drafts=R0/R1/R2 if allowExternalDrafts; never R3.
 * R3: emit approval_required and pause (no auto-dispatch).
 */

import { getPrismaClient } from '../lib/prisma.js';
import { getChainPlan, advanceChainCursor } from './chainPlan.js';
import { createAgentRun } from './agentRun.js';
import { executeAgentRunInProcess } from './agentRunExecutor.js';
import { mergeMissionContext } from './mission.js';
import { createAgentMessage } from '../orchestrator/lib/agentMessage.js';
import { findMissionTaskBySuggestion } from './missionTask.js';

const MAX_AUTO_DISPATCH_PER_HOUR = 10;
const WINDOW_MS = 60 * 60 * 1000;

/** @type {Map<string, { count: number, windowStart: number }>} */
const rateLimitByMission = new Map();

function checkRateLimit(missionId) {
  const now = Date.now();
  let entry = rateLimitByMission.get(missionId);
  if (!entry) {
    entry = { count: 0, windowStart: now };
    rateLimitByMission.set(missionId, entry);
  }
  if (now - entry.windowStart >= WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  if (entry.count >= MAX_AUTO_DISPATCH_PER_HOUR) return false;
  entry.count += 1;
  return true;
}

/**
 * Check if there is any approval_required message without a decision.
 */
async function hasPendingApproval(missionId) {
  const prisma = getPrismaClient();
  const approvalMessages = await prisma.agentMessage.findMany({
    where: { missionId, messageType: 'approval_required' },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });
  if (approvalMessages.length === 0) return false;
  const decided = await prisma.agentMessage.findMany({
    where: { missionId, senderType: 'system' },
    select: { payload: true },
  });
  const decidedIds = new Set();
  for (const m of decided) {
    const id = m.payload && typeof m.payload === 'object' ? m.payload.decidedMessageId : null;
    if (id) decidedIds.add(id);
  }
  return approvalMessages.some((m) => !decidedIds.has(m.id));
}

/**
 * Check if there is an AgentRun with status = 'running' for this mission.
 */
async function hasRunningRun(missionId) {
  const prisma = getPrismaClient();
  const run = await prisma.agentRun.findFirst({
    where: { missionId, status: 'running' },
    select: { id: true },
  });
  return !!run;
}

/**
 * Check if the run at current cursor already failed (so we don't auto-retry).
 */
async function lastChainRunFailed(missionId, chainId, suggestionId) {
  const prisma = getPrismaClient();
  const runs = await prisma.agentRun.findMany({
    where: { missionId, status: 'failed' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { input: true },
  });
  return runs.some(
    (r) =>
      r.input &&
      typeof r.input === 'object' &&
      r.input.chainId === chainId &&
      r.input.suggestionId === suggestionId
  );
}

/**
 * Idempotency: already a run (any status) for this (missionId, chainId, suggestionId)?
 */
async function hasRunForSuggestion(missionId, chainId, suggestionId) {
  const prisma = getPrismaClient();
  const runs = await prisma.agentRun.findMany({
    where: { missionId },
    select: { input: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return runs.some(
    (r) => r.input && typeof r.input === 'object' && r.input.chainId === chainId && r.input.suggestionId === suggestionId
  );
}

/**
 * Whether the current mode and risk allow auto-dispatch. Loads allowExternalDrafts from mission.context.
 */
function canAutoDispatchByRisk(mode, risk, allowExternalDrafts) {
  if (mode === 'manual') return false;
  if (risk === 'R3') return false;
  if (mode === 'auto_safe') return risk === 'R0' || risk === 'R1';
  if (mode === 'auto_drafts') {
    if (risk === 'R0' || risk === 'R1') return true;
    if (risk === 'R2') return Boolean(allowExternalDrafts);
    return false;
  }
  return false;
}

/**
 * Emit approval_required for R3 step (once per suggestion); merge approvalEmittedFor into plan.
 */
async function emitR3ApprovalRequired(missionId, plan, suggestion) {
  const emitted = Array.isArray(plan.approvalEmittedFor) ? plan.approvalEmittedFor : [];
  if (emitted.includes(suggestion.id)) return;
  const label = suggestion.label || suggestion.intent || suggestion.agentKey || 'This step';
  const prompt = `Approval required (R3): "${label}" may send external communication or take high-impact action. Please approve or skip.`;
  await createAgentMessage({
    missionId,
    senderId: 'mission-run',
    senderType: 'system',
    channel: 'main',
    text: prompt,
    messageType: 'approval_required',
    payload: {
      prompt,
      options: [
        { id: 'run', label: 'Run' },
        { id: 'skip', label: 'Skip' },
      ],
      chainId: plan.chainId,
      suggestionId: suggestion.id,
    },
    visibleToUser: true,
  });
  await mergeMissionContext(missionId, {
    chainPlan: { ...plan, approvalEmittedFor: [...emitted, suggestion.id] },
  });
}

/**
 * Maybe dispatch the next agent run for the mission's chain.
 * Policy: manual=never; auto_safe=R0/R1; auto_drafts=R0/R1/R2 if allowExternalDrafts; never R3. R3 emits approval_required.
 *
 * @param {string} missionId
 * @param {string} reason - 'run_completed' | 'decision_recorded' | 'chain_plan_created' | 'chain_plan_updated'
 */
export async function maybeAutoDispatch(missionId, reason) {
  const id = typeof missionId === 'string' ? missionId.trim() : '';
  if (!id) return;

  if (await hasPendingApproval(id)) return;
  if (await hasRunningRun(id)) return;

  const plan = await getChainPlan(id);
  if (!plan) return;
  const mode = plan.mode === 'auto_drafts' ? 'auto_drafts' : plan.mode === 'auto_safe' ? 'auto_safe' : 'manual';
  if (mode === 'manual') return;

  const prisma = getPrismaClient();
  const mission = await prisma.mission.findUnique({
    where: { id },
    select: { tenantId: true, context: true },
  });
  const allowExternalDrafts = mission?.context && typeof mission.context === 'object' && mission.context.allowExternalDrafts === true;

  const cursor = Number(plan.cursor) || 0;
  const suggestions = Array.isArray(plan.suggestions) ? plan.suggestions : [];
  const suggestion = suggestions[cursor];
  if (!suggestion || !suggestion.id) return;

  // Explicitly pause when the latest run for this chain step is blocked (tool approval gating).
  // This is additive: non-blocked runs and non-tool flows keep existing behavior.
  const blockedRun = await prisma.agentRun.findFirst({
    where: { missionId: id, status: 'blocked' },
    orderBy: { createdAt: 'desc' },
    select: { input: true },
  });
  if (
    blockedRun &&
    blockedRun.input &&
    typeof blockedRun.input === 'object' &&
    blockedRun.input.chainId === plan.chainId &&
    blockedRun.input.suggestionId === suggestion.id
  ) {
    if (plan.status !== 'waiting_approval') {
      try {
        await mergeMissionContext(id, { chainPlan: { ...plan, status: 'waiting_approval' } });
      } catch (err) {
        console.warn(
          '[maybeAutoDispatch] failed to mark chainPlan waiting_approval for blocked run:',
          err?.message || err
        );
      }
    }
    console.log('[maybeAutoDispatch] paused: blocked', {
      missionId: id,
      chainId: plan.chainId,
      suggestionId: suggestion.id,
    });
    return;
  }

  const missionTask = await findMissionTaskBySuggestion(id, suggestion.id);
  if (missionTask && missionTask.status === 'completed') return;

  const risk = suggestion.risk && ['R0', 'R1', 'R2', 'R3'].includes(suggestion.risk) ? suggestion.risk : 'R1';

  if (risk === 'R3') {
    await emitR3ApprovalRequired(id, plan, suggestion);
    return;
  }

  if (!canAutoDispatchByRisk(mode, risk, allowExternalDrafts)) return;
  if (await lastChainRunFailed(id, plan.chainId, suggestion.id)) return;
  if (await hasRunForSuggestion(id, plan.chainId, suggestion.id)) return;
  if (!checkRateLimit(id)) return;

  const tenantId = mission?.tenantId || id;

  const run = await createAgentRun({
    missionId: id,
    tenantId,
    agentKey: suggestion.agentKey || 'planner',
    triggerMessageId: null,
    input: {
      intent: suggestion.intent || '',
      chainId: plan.chainId,
      suggestionId: suggestion.id,
    },
  });

  if (suggestion.agentKey === 'research' && process.env.MISSION_RUN_INPROCESS === 'true') {
    executeAgentRunInProcess(run.id).catch((err) => {
      console.warn('[maybeAutoDispatch] in-process run failed:', err?.message || err);
    });
  }
}
