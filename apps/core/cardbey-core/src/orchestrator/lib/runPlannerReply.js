/**
 * Enqueue a planner reply when the user sends a message in Agent Chat.
 * Creates an OrchestratorTask with entryPoint 'agent_chat_reply' and runs
 * executeTask in the background so the planner can post a reply to the same mission.
 */

import { getPrismaClient } from '../../lib/prisma.js';

/**
 * @typedef {Object} RunPlannerReplyOptions
 * @property {boolean} [useRag] - If true, run RAG before planning; if false, skip. Undefined = use default for entry point.
 */

/**
 * Trigger planner to respond to a user message in the mission chat.
 * Fire-and-forget: creates a task and runs executeTask in background.
 *
 * @param {string} missionId - Mission/chat id (same as in AgentMessage)
 * @param {string} userId - Authenticated user id
 * @param {string} tenantId - Tenant id (e.g. req.user?.business?.id || userId)
 * @param {string} lastUserMessage - The user's message text
 * @param {RunPlannerReplyOptions} [options] - Optional: { useRag?: boolean }
 */
export async function runPlannerReplyForMission(missionId, userId, tenantId, lastUserMessage, options = {}) {
  if (!missionId || !userId || !tenantId) {
    console.warn('[runPlannerReply] Missing missionId, userId, or tenantId');
    return;
  }
  const prisma = getPrismaClient();
  const useRag = options.useRag;
  const requestPayload = {
    missionId: String(missionId).trim(),
    lastUserMessage: typeof lastUserMessage === 'string' ? lastUserMessage : '',
    ...(typeof useRag === 'boolean' && { useRag }),
  };
  let task;
  try {
    task = await prisma.orchestratorTask.create({
      data: {
        entryPoint: 'agent_chat_reply',
        tenantId: String(tenantId),
        userId: String(userId),
        insightId: null,
        status: 'queued',
        request: requestPayload,
      },
    });
  } catch (err) {
    console.warn('[runPlannerReply] Failed to create task:', err?.message || err);
    return;
  }

  const payload = {
    missionId: String(missionId).trim(),
    lastUserMessage: typeof lastUserMessage === 'string' ? lastUserMessage : '',
    ...(typeof useRag === 'boolean' && { useRag }),
  };
  const context = {
    tenantId: String(tenantId),
    userId: String(userId),
    taskId: task.id,
    toolSteps: [],
  };
  const runOptions = typeof useRag === 'boolean' ? { useRag } : {};

  setImmediate(async () => {
    const { executeTask } = await import('../api/insightsOrchestrator.js');
    try {
      await prisma.orchestratorTask.update({
        where: { id: task.id },
        data: { status: 'running' },
      });
      const result = await executeTask('agent_chat_reply', payload, context, runOptions);
      const resultWithSteps =
        result && typeof result === 'object'
          ? { ...result, toolSteps: context.toolSteps ?? [] }
          : { toolSteps: context.toolSteps ?? [] };
      const serializable =
        resultWithSteps && typeof resultWithSteps === 'object'
          ? JSON.parse(JSON.stringify(resultWithSteps))
          : resultWithSteps;
      await prisma.orchestratorTask.update({
        where: { id: task.id },
        data: { status: 'completed', result: serializable },
      });
      const { computeAndSaveReward } = await import('../orchestratorRewardService.js');
      computeAndSaveReward({
        orchestratorTaskId: task.id,
        missionId: payload.missionId || task.id,
        tenantId: context.tenantId,
        result: serializable,
        missionType: 'agent_chat_reply',
      }).catch((err) => console.warn('[runPlannerReply] Reward computation failed:', err?.message || err));
    } catch (err) {
      console.warn('[runPlannerReply] Task failed:', task.id, err?.message || err);
      await prisma.orchestratorTask.update({
        where: { id: task.id },
        data: {
          status: 'failed',
          result: {
            ok: false,
            error: err?.name || 'execution_error',
            message: err?.message || String(err),
          },
        },
      }).catch(() => {});
    }
  });
}
