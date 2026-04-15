/**
 * Agent Chat turn handler: after a user message, run Research (optional) then Planner.
 * In group_chat mode: both agents run every turn; Research runs first (with timeout), Planner synthesizes.
 * Both agents post to AgentMessage and are emitted via SSE so the frontend sees them in order.
 */

import { runResearchAgent } from '../agents/researchAgent.js';
import { runPlannerAgent } from '../agents/plannerAgent.js';
import { getPrismaClient } from '../lib/prisma.js';
import { isTextOnlyMission } from '../lib/missionConfig.js';
import { createAgentRun, updateAgentRunStatus } from '../lib/agentRun.js';
import { BIDDING_LAYER_ENABLED } from '../lib/biddingConfig.js';
import { seedAgentProfiles } from '../lib/agentProfile.js';
import {
  createAgentTask,
  runAuction,
  linkAssignmentToRun,
  completeAgentTask,
} from '../lib/biddingTask.js';
import { recordAssignmentCompletion } from '../lib/assignmentReward.js';

export interface HandleUserTurnParams {
  missionId: string;
  tenantId: string;
  userMessage: string;
  /** When set, agents will attach threadId to created messages (and broadcast to thread SSE). */
  threadId?: string;
  /** When set (e.g. from POST /agent-messages), used to create AgentRun records and link runs to the triggering message. */
  triggerMessageId?: string;
}

/** Default useResearchAgent when no config exists */
const DEFAULT_USE_RESEARCH_AGENT = true;

/** Research timeout in group_chat so Planner does not block indefinitely (ms). */
const GROUP_CHAT_RESEARCH_TIMEOUT_MS = 25_000;

/**
 * Get useResearchAgent for a mission (from AgentChatConfig or default).
 * For test-mission-agent-chat: returns false (planner-only, no research) so text chat works without Perplexity.
 */
async function getUseResearchAgent(missionId: string): Promise<boolean> {
  if (isTextOnlyMission(missionId)) return false;
  const prisma = getPrismaClient();
  const config = await prisma.agentChatConfig.findUnique({
    where: { missionId },
    select: { useResearchAgent: true },
  }).catch(() => null);
  return config?.useResearchAgent ?? DEFAULT_USE_RESEARCH_AGENT;
}

/**
 * Get chatMode for a mission from Mission.context (default | group_chat).
 * For test-mission-agent-chat: returns 'default' (single-agent flow, no group_chat).
 */
async function getChatMode(missionId: string): Promise<'default' | 'group_chat'> {
  if (isTextOnlyMission(missionId)) return 'default';
  const prisma = getPrismaClient();
  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    select: { context: true },
  }).catch(() => null);
  const ctx = mission?.context && typeof mission.context === 'object' ? (mission.context as Record<string, unknown>) : {};
  const mode = ctx.chatMode;
  return mode === 'group_chat' ? 'group_chat' : 'default';
}

/**
 * Run Research with a timeout; on timeout return null so Planner can proceed without research.
 */
async function runResearchWithTimeout(
  params: Parameters<typeof runResearchAgent>[0] & { groupChatMode?: boolean },
  timeoutMs: number
): Promise<{ answer: string } | null> {
  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });
  const result = await Promise.race([runResearchAgent(params), timeoutPromise]);
  return result;
}

/**
 * Handle one user turn: run Research Agent (if enabled or in group_chat), then Planner Agent with research summary.
 * In group_chat mode: always run Research first (with timeout), then Planner; create AgentRun records for both.
 * Errors are logged and do not throw so the original POST response is unaffected.
 */
export async function handleUserTurn(params: HandleUserTurnParams): Promise<void> {
  const { missionId, tenantId, userMessage, threadId, triggerMessageId } = params;
  const missionIdTrimmed = (missionId || '').trim();
  if (!missionIdTrimmed) {
    console.warn('[agentChatTurn] missionId required');
    return;
  }

  const chatMode = await getChatMode(missionIdTrimmed);
  const isGroupChat = chatMode === 'group_chat';
  const useResearch = isGroupChat || (await getUseResearchAgent(missionIdTrimmed));

  let researchSummary: string | undefined;
  let researchRunId: string | null = null;
  let plannerRunId: string | null = null;
  /** When bidding layer is used: assignment/task ids for recording completion. */
  let biddingResearch: { assignmentId: string; taskId: string; runCreatedAt: Date } | null = null;
  let biddingPlanner: { assignmentId: string; taskId: string; runCreatedAt: Date } | null = null;

  if (isGroupChat && triggerMessageId && tenantId) {
    try {
      if (BIDDING_LAYER_ENABLED) {
        await seedAgentProfiles().catch(() => {});
        const taskResearch = await createAgentTask({
          missionId: missionIdTrimmed,
          userMessageId: triggerMessageId,
          type: 'do_research',
          payload: { intent: userMessage.slice(0, 200) },
        });
        const taskPlanner = await createAgentTask({
          missionId: missionIdTrimmed,
          userMessageId: triggerMessageId,
          type: 'plan_marketing',
          payload: { intent: userMessage.slice(0, 200) },
        });
        const auction1 = await runAuction(taskResearch.id);
        const auction2 = await runAuction(taskPlanner.id);
        if (auction1?.assignment?.agentKey === 'research' && auction2?.assignment?.agentKey === 'planner') {
          const researchRun = await createAgentRun({
            missionId: missionIdTrimmed,
            tenantId: String(tenantId),
            agentKey: 'research',
            triggerMessageId,
            input: { intent: userMessage.slice(0, 200), assignmentId: auction1.assignment.id },
          });
          researchRunId = researchRun.id;
          await linkAssignmentToRun(auction1.assignment.id, researchRun.id);
          biddingResearch = {
            assignmentId: auction1.assignment.id,
            taskId: taskResearch.id,
            runCreatedAt: researchRun.createdAt,
          };
          const plannerRun = await createAgentRun({
            missionId: missionIdTrimmed,
            tenantId: String(tenantId),
            agentKey: 'planner',
            triggerMessageId,
            input: {
              intent: userMessage.slice(0, 200),
              waitsForResearchRunId: researchRun.id,
              assignmentId: auction2.assignment.id,
            },
          });
          plannerRunId = plannerRun.id;
          await linkAssignmentToRun(auction2.assignment.id, plannerRun.id);
          biddingPlanner = {
            assignmentId: auction2.assignment.id,
            taskId: taskPlanner.id,
            runCreatedAt: plannerRun.createdAt,
          };
        } else {
          // Fallback: create runs without bidding linkage
          const researchRun = await createAgentRun({
            missionId: missionIdTrimmed,
            tenantId: String(tenantId),
            agentKey: 'research',
            triggerMessageId,
            input: { intent: userMessage.slice(0, 200) },
          });
          researchRunId = researchRun.id;
          const plannerRun = await createAgentRun({
            missionId: missionIdTrimmed,
            tenantId: String(tenantId),
            agentKey: 'planner',
            triggerMessageId,
            input: { intent: userMessage.slice(0, 200), waitsForResearchRunId: researchRun.id },
          });
          plannerRunId = plannerRun.id;
        }
      } else {
        const researchRun = await createAgentRun({
          missionId: missionIdTrimmed,
          tenantId: String(tenantId),
          agentKey: 'research',
          triggerMessageId,
          input: { intent: userMessage.slice(0, 200) },
        });
        researchRunId = researchRun.id;
        const plannerRun = await createAgentRun({
          missionId: missionIdTrimmed,
          tenantId: String(tenantId),
          agentKey: 'planner',
          triggerMessageId,
          input: { intent: userMessage.slice(0, 200), waitsForResearchRunId: researchRun.id },
        });
        plannerRunId = plannerRun.id;
      }
    } catch (err) {
      console.warn('[agentChatTurn] Failed to create AgentRun records:', err instanceof Error ? err.message : err);
    }
  }

  try {
    if (useResearch) {
      const researchParams = {
        missionId: missionIdTrimmed,
        tenantId,
        userMessage,
        threadId,
        groupChatMode: isGroupChat,
      };
      const result = isGroupChat
        ? await runResearchWithTimeout(researchParams, GROUP_CHAT_RESEARCH_TIMEOUT_MS)
        : await runResearchAgent(researchParams);
      researchSummary = result?.answer ?? undefined;
      if (researchRunId) {
        await updateAgentRunStatus(researchRunId, result ? 'completed' : 'failed', {
          output: result ? { answer: result.answer } : undefined,
          error: result ? undefined : 'Timeout or research failed',
        }).catch(() => {});
        if (biddingResearch) {
          const latencyMs = Date.now() - new Date(biddingResearch.runCreatedAt).getTime();
          await recordAssignmentCompletion(biddingResearch.assignmentId, {
            success: !!result,
            latencyMs,
            tokensUsed: undefined,
            cost: undefined,
            autoQualityScore: undefined,
          }).catch(() => {});
          await completeAgentTask(biddingResearch.taskId, result ? 'completed' : 'failed').catch(() => {});
        }
      }
      if (isGroupChat && !result?.answer) {
        console.warn('[agentChatTurn] group_chat: Research timed out or failed; Planner will answer without research.');
      }
    }
  } catch (err) {
    console.warn('[agentChatTurn] Research step failed:', err instanceof Error ? err.message : err);
    if (researchRunId) {
      await updateAgentRunStatus(researchRunId, 'failed', { error: (err as Error)?.message ?? String(err) }).catch(() => {});
      if (biddingResearch) {
        await recordAssignmentCompletion(biddingResearch.assignmentId, {
          success: false,
          latencyMs: undefined,
          tokensUsed: undefined,
          cost: undefined,
          autoQualityScore: undefined,
        }).catch(() => {});
        await completeAgentTask(biddingResearch.taskId, 'failed').catch(() => {});
      }
    }
  }

  try {
    const plannerResearchSummary =
      isGroupChat && useResearch && researchSummary === undefined
        ? '(Research unavailable or timed out for this turn. Proceed with your own reasoning and note the limitation to the user.)'
        : researchSummary;
    await runPlannerAgent({
      missionId: missionIdTrimmed,
      tenantId,
      userMessage,
      researchSummary: plannerResearchSummary,
      threadId,
      groupChatMode: isGroupChat,
    });
    if (plannerRunId) {
      await updateAgentRunStatus(plannerRunId, 'completed', { output: { done: true } }).catch(() => {});
      if (biddingPlanner) {
        const latencyMs = Date.now() - new Date(biddingPlanner.runCreatedAt).getTime();
        await recordAssignmentCompletion(biddingPlanner.assignmentId, {
          success: true,
          latencyMs,
          tokensUsed: undefined,
          cost: undefined,
          autoQualityScore: undefined,
        }).catch(() => {});
        await completeAgentTask(biddingPlanner.taskId, 'completed').catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[agentChatTurn] Planner step failed:', err instanceof Error ? err.message : err);
    if (plannerRunId) {
      await updateAgentRunStatus(plannerRunId, 'failed', { error: (err as Error)?.message ?? String(err) }).catch(() => {});
      if (biddingPlanner) {
        await recordAssignmentCompletion(biddingPlanner.assignmentId, {
          success: false,
          latencyMs: undefined,
          tokensUsed: undefined,
          cost: undefined,
          autoQualityScore: undefined,
        }).catch(() => {});
        await completeAgentTask(biddingPlanner.taskId, 'failed').catch(() => {});
      }
    }
  }
}
