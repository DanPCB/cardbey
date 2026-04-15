/**
 * Persist orchestrator "speech" as AgentMessage for multi-agent conversation UI.
 * missionId should be the current OrchestratorTask.id (or generic mission id).
 *
 * Example payloads by messageType (for UI cards):
 * - research_result: { summary, citations?: string[], query?, sources?: [{ id, snippet, sourcePath }] }
 * - plan_update:     { title?, steps: string[], status? }
 * - execution_suggestions: { suggestions: [{ label, agentKey, intent }] }
 * - campaign_proposal: { title?, sections: [{ heading?, body? }] }
 * - approval_required: { prompt?, options: [{ id, label }] }
 * - artifact:        { title?, url?, mimeType?, preview? }
 */

import { getPrismaClient } from '../../lib/prisma.js';
import { broadcastAgentMessage, broadcastThreadMessage } from '../../realtime/simpleSse.js';
import { inferExecutionSuggestions } from './inferExecutionSuggestions.js';
import { buildChainPlan, saveChainPlan, getChainPlan, computeChainStatus } from '../../lib/chainPlan.js';
import { maybeAutoDispatch } from '../../lib/maybeAutoDispatch.js';
import { mergeMissionContext } from '../../lib/mission.js';
import { createMissionTasksFromPlanUpdate } from '../../lib/missionTask.js';

/**
 * Find or create a single checkpoint_form message per (missionId, checkpointKey, triggerMessageId).
 * Idempotent: if one exists, returns it; otherwise creates and returns.
 *
 * @param {{ missionId: string, triggerMessageId?: string | null, checkpointKey: string, payload: object, text?: string }}
 * @returns {Promise<object|null>} Existing or created AgentMessage row
 */
export async function findOrCreateCheckpointFormMessage({
  missionId,
  triggerMessageId = null,
  checkpointKey,
  payload,
  text,
}) {
  if (!missionId || !checkpointKey || !payload || typeof payload !== 'object') return null;
  const prisma = getPrismaClient();
  const messages = await prisma.agentMessage.findMany({
    where: { missionId, messageType: 'checkpoint_form' },
    select: { id: true, payload: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const match = (messages || []).find((m) => {
    if (!m.payload || typeof m.payload !== 'object') return false;
    if (m.payload.checkpointKey !== checkpointKey) return false;
    if (triggerMessageId != null && m.payload.triggerMessageId !== triggerMessageId) return false;
    return true;
  });
  if (match) {
    return prisma.agentMessage.findUnique({ where: { id: match.id } }).catch(() => null);
  }
  const payloadWithMeta = { ...payload, checkpointKey, triggerMessageId: triggerMessageId ?? undefined };
  return createAgentMessage({
    missionId,
    senderId: 'planner',
    senderType: 'agent',
    channel: 'main',
    text: text || payload.title || 'Checkpoint',
    messageType: 'checkpoint_form',
    payload: payloadWithMeta,
    visibleToUser: true,
  });
}

/**
 * Create an AgentMessage and optionally broadcast to SSE clients subscribed to this mission (and thread if threadId set).
 *
 * @param {object} opts
 * @param {string} opts.missionId - OrchestratorTask.id or mission id
 * @param {string} [opts.threadId] - Optional thread id; when set, message is attached to thread and broadcast to thread SSE
 * @param {string} opts.senderId - e.g. 'planner', 'research-agent', 'cardbey-orchestrator'
 * @param {string} opts.senderType - 'agent' | 'orchestrator' | 'user'
 * @param {string} opts.channel - 'main' | 'research' | 'dev' | 'content' | etc.
 * @param {string} [opts.performative] - 'inform' | 'request' | 'critique' | 'handoff' | etc.
 * @param {string} opts.text - Message content (display text)
 * @param {string} [opts.messageType='text'] - 'text' | 'research_result' | 'plan_update' | 'campaign_proposal' | 'approval_required' | 'artifact'
 * @param {object|array} [opts.payload] - Structured payload (JSON, size-limited at API)
 * @param {boolean} [opts.visibleToUser=true] - If false, internal note (e.g. critique) hidden from user
 * @returns {Promise<object>} Created AgentMessage row (or null on error)
 */
export async function createAgentMessage({
  missionId,
  threadId = null,
  senderId,
  senderType,
  channel,
  performative = null,
  text,
  messageType = 'text',
  payload = null,
  visibleToUser = true,
}) {
  if (!missionId || !senderId || !senderType || !channel || text == null) {
    return null;
  }
  const prisma = getPrismaClient();
  try {
    const message = await prisma.agentMessage.create({
      data: {
        missionId,
        threadId: threadId || undefined,
        senderType,
        senderId,
        visibleToUser,
        channel,
        performative: performative || null,
        messageType: messageType || 'text',
        content: { text: String(text) },
        payload: payload ?? undefined,
      },
    });
    broadcastAgentMessage(missionId, { missionId, message });
    if (threadId) broadcastThreadMessage(threadId, { threadId, message });

    if (messageType === 'plan_update' && payload && typeof payload === 'object' && Array.isArray(payload.steps) && payload.steps.length > 0) {
      const suggestions = inferExecutionSuggestions(payload);
      if (suggestions.length > 0) {
        try {
          const suggestionsMsg = await createAgentMessage({
            missionId,
            threadId,
            senderId: 'planner',
            senderType: 'system',
            channel,
            text: `Suggestions (${suggestions.length})`,
            messageType: 'execution_suggestions',
            payload: { suggestions },
            visibleToUser: true,
          });
          if (suggestionsMsg?.id) {
            const chainPlan = buildChainPlan(suggestions, message.id, suggestionsMsg.id, 'manual');
            await saveChainPlan(missionId, chainPlan);
            const saved = await getChainPlan(missionId).catch(() => null);
            if (saved) {
              const status = await computeChainStatus(missionId, saved).catch(() => 'running');
              await mergeMissionContext(missionId, { chainPlan: { ...saved, status } }).catch(() => {});
            }
            if (process.env.ENABLE_REVIEWER === 'true') {
              const { createAgentRun } = await import('../../lib/agentRun.js');
              const { executeAgentRunInProcess } = await import('../../lib/agentRunExecutor.js');
              const prisma = getPrismaClient();
              const mission = await prisma.mission.findUnique({ where: { id: missionId }, select: { tenantId: true } }).catch(() => null);
              const tenantId = (mission?.tenantId || missionId).toString();
              createAgentRun({
                missionId,
                tenantId,
                agentKey: 'reviewer',
                triggerMessageId: message.id,
                input: { intent: 'review_plan', planMessageId: message.id, triggerMessageId: message.id },
              })
                .then((run) => executeAgentRunInProcess(run.id))
                .catch((err) => console.warn('[createAgentMessage] reviewer run failed:', err?.message || err));
            }
            await createMissionTasksFromPlanUpdate(missionId, message.id, suggestions, suggestionsMsg.id).catch((err) =>
              console.warn('[createAgentMessage] createMissionTasksFromPlanUpdate failed:', err?.message || err)
            );
            maybeAutoDispatch(missionId, 'chain_plan_created').catch((err) =>
              console.warn('[createAgentMessage] maybeAutoDispatch failed:', err?.message || err)
            );
          }
        } catch (err) {
          console.warn('[createAgentMessage] execution_suggestions follow-up failed:', err?.message || err);
        }
      }
    }
    return message;
  } catch (err) {
    console.warn('[createAgentMessage] Failed to persist:', err?.message || err);
    return null;
  }
}
