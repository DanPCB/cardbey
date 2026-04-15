/**
 * ChainPlan (v0): stored in Mission.context.chainPlan.
 * Shape: { chainId, mode: "manual"|"auto_safe"|"auto_drafts", suggestions: [{ id, agentKey, intent, risk, requiresApproval }], cursor, createdFromMessageId, approvalEmittedFor? }.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { mergeMissionContext } from './mission.js';
import { getRiskForIntent, requiresApprovalForRisk } from './intentRiskMap.js';

/**
 * Build a new ChainPlan from suggestions (e.g. from inferExecutionSuggestions).
 *
 * @param {{ id?: string, agentKey?: string, intent?: string, risk?: string, requiresApproval?: boolean }[]} suggestions
 * @param {string} createdFromMessageId - plan_update message id
 * @param {string} chainId - execution_suggestions message id
 * @param {'manual'|'auto_safe'|'auto_drafts'} [mode='manual']
 * @returns {{ chainId: string, mode: string, suggestions: object[], cursor: number, createdFromMessageId: string }}
 */
export function buildChainPlan(suggestions, createdFromMessageId, chainId, mode = 'manual') {
  const list = Array.isArray(suggestions)
    ? suggestions.map((s) => {
        const intent = s && typeof s.intent === 'string' ? s.intent : '';
        const risk = (s && s.risk) && ['R0', 'R1', 'R2', 'R3'].includes(s.risk) ? s.risk : getRiskForIntent(intent);
        return {
          id: s && typeof s.id === 'string' ? s.id : `s${Math.random().toString(36).slice(2, 8)}`,
          agentKey: s && typeof s.agentKey === 'string' ? s.agentKey : 'planner',
          intent,
          risk,
          requiresApproval: s && typeof s.requiresApproval === 'boolean' ? s.requiresApproval : requiresApprovalForRisk(risk),
        };
      })
    : [];
  const modeVal = mode === 'auto_drafts' ? 'auto_drafts' : mode === 'auto_safe' ? 'auto_safe' : 'manual';
  return {
    chainId: String(chainId),
    mode: modeVal,
    suggestions: list,
    cursor: 0,
    createdFromMessageId: String(createdFromMessageId),
  };
}

/**
 * Save (replace) ChainPlan for a mission. Mission must exist.
 *
 * @param {string} missionId
 * @param {object} chainPlan - full ChainPlan object
 * @returns {Promise<object|null>} merged context or null
 */
export async function saveChainPlan(missionId, chainPlan) {
  if (!chainPlan || typeof chainPlan !== 'object') return null;
  return mergeMissionContext(missionId, { chainPlan });
}

/**
 * Get ChainPlan from mission context.
 *
 * @param {string} missionId
 * @returns {Promise<object|null>} chainPlan or null
 */
export async function getChainPlan(missionId) {
  if (!missionId || typeof missionId !== 'string' || !missionId.trim()) return null;
  const prisma = getPrismaClient();
  const mission = await prisma.mission.findUnique({
    where: { id: missionId.trim() },
    select: { context: true },
  });
  const ctx = mission?.context;
  if (!ctx || typeof ctx !== 'object' || !ctx.chainPlan) return null;
  const plan = ctx.chainPlan;
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.suggestions)) return null;
  return plan;
}

/**
 * Advance chain cursor by one (after a run completes successfully). Merges into context.
 *
 * @param {string} missionId
 * @returns {Promise<object|null>} updated chainPlan or null
 */
export async function advanceChainCursor(missionId) {
  const plan = await getChainPlan(missionId);
  if (!plan) return null;
  const cursor = Math.min(Number(plan.cursor) + 1, (plan.suggestions?.length ?? 0));
  const status = await computeChainStatus(missionId, { ...plan, cursor });
  await mergeMissionContext(missionId, {
    chainPlan: { ...plan, cursor, status },
  });
  return { ...plan, cursor, status };
}

/**
 * Compute chain status from plan, runs, and approvals. Additive: if status missing elsewhere, infer with this.
 * running: cursor < len and no blocks.
 * waiting_approval: next step requiresApproval or any pending approval_required without decision.
 * blocked_error: last run for current step failed.
 * completed: cursor >= suggestions.length.
 *
 * @param {string} missionId
 * @param {object} [plan] - chain plan (if not provided, loaded via getChainPlan)
 * @returns {Promise<'running'|'waiting_approval'|'blocked_error'|'completed'>}
 */
export async function computeChainStatus(missionId, plan = null) {
  const id = typeof missionId === 'string' ? missionId.trim() : '';
  if (!id) return 'running';
  const p = plan || (await getChainPlan(id));
  if (!p || !Array.isArray(p.suggestions)) return 'running';
  const cursor = Number(p.cursor) || 0;
  const len = p.suggestions.length;
  if (cursor >= len) return 'completed';

  const prisma = getPrismaClient();
  const currentStep = p.suggestions[cursor];
  const chainId = p.chainId;
  const suggestionId = currentStep?.id;

  const runs = await prisma.agentRun.findMany({
    where: { missionId: id, status: 'failed' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { input: true },
  });
  const lastRunForStepFailed = suggestionId && runs.some(
    (r) => r.input && typeof r.input === 'object' && r.input.chainId === chainId && r.input.suggestionId === suggestionId
  );
  if (lastRunForStepFailed) return 'blocked_error';

  const approvalMessages = await prisma.agentMessage.findMany({
    where: { missionId: id, messageType: 'approval_required' },
    select: { id: true },
  });
  let hasPendingApproval = false;
  if (approvalMessages.length > 0) {
    const decided = await prisma.agentMessage.findMany({
      where: { missionId: id, senderType: 'system' },
      select: { payload: true },
    });
    const decidedIds = new Set();
    for (const m of decided) {
      const did = m.payload && typeof m.payload === 'object' ? m.payload.decidedMessageId : null;
      if (did) decidedIds.add(did);
    }
    hasPendingApproval = approvalMessages.some((m) => !decidedIds.has(m.id));
  }
  if (currentStep?.requiresApproval === true || hasPendingApproval) return 'waiting_approval';

  return 'running';
}
