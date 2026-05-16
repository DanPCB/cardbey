/**
 * handleUserTurn: entry from POST /api/agent-messages after user message is stored.
 * Classifies intent; FIX_IMAGE_MISMATCH → ops run or clarifying question; MARKETING/other → planner run.
 * OCR is NOT scheduled here (route skips scheduleOcrForMessage when intent is MARKETING or FIX_IMAGE_MISMATCH).
 *
 * Current flow (comment):
 *   POST /api/agent-messages → create AgentMessage → handleUserTurn(missionId, tenantId, userMessage, threadId, triggerMessageId)
 *   → classifyIntent(text)
 *   → FIX_IMAGE_MISMATCH: parse entity; if missing → post "Which store/draft should I repair?" and return
 *   → FIX_IMAGE_MISMATCH + entity + !admin → post permission message and return
 *   → FIX_IMAGE_MISMATCH + entity + admin → createAgentRun(agentKey='ops', input={ objective, entityType, entityId }), executeAgentRunInProcess
 *   → else → createAgentRun(agentKey='planner', ...), executeAgentRunInProcess
 */

import { createAgentMessage } from './lib/agentMessage.js';
import { createAgentRun } from '../lib/agentRun.js';
import { executeAgentRunInProcess } from '../lib/agentRunExecutor.js';
import { classifyIntent, INTENT_FIX_IMAGE_MISMATCH, parseEntityFromMessage } from '../lib/agentIntentRouter.js';
import { isUserAdmin } from '../lib/opsToolRegistry.js';
import { getPrismaClient } from '../lib/prisma.js';

/**
 * Handle a user turn: optionally create and run an agent (ops or planner).
 * @param {{ missionId: string, tenantId: string, userMessage: string, threadId?: string, triggerMessageId: string }} params
 */
export async function handleUserTurn({ missionId, tenantId, userMessage, threadId, triggerMessageId }) {
  const text = typeof userMessage === 'string' ? userMessage : '';
  if (process.env.EXECUTE_INTENT_SHADOW === 'true' && text.trim()) {
    const shadowText = text;
    const shadowMissionId = missionId;
    setImmediate(() => {
      import('../lib/orchestrator/executeIntent.js')
        .then(({ executeIntent }) =>
          executeIntent(
            {
              source: 'chat',
              rawInput: shadowText,
              context: { missionId: shadowMissionId },
              correlationId: shadowMissionId,
            },
            { shadow: true },
          ),
        )
        .catch(() => {});
    });
  }
  const intent = classifyIntent(text);

  if (intent === INTENT_FIX_IMAGE_MISMATCH) {
    const entity = parseEntityFromMessage(text, null);
    if (!entity) {
      await createAgentMessage({
        missionId,
        senderType: 'agent',
        senderId: 'ops',
        channel: 'main',
        text: 'Which store or draft should I repair? Please specify e.g. "draftStore <id>" or "store <id>".',
        messageType: 'text',
        payload: null,
        visibleToUser: true,
      });
      return;
    }
    const prisma = getPrismaClient();
    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
      select: { createdByUserId: true },
    }).catch(() => null);
    const userId = mission?.createdByUserId || null;
    const admin = await isUserAdmin(userId);
    if (!admin) {
      await createAgentMessage({
        missionId,
        senderType: 'agent',
        senderId: 'ops',
        channel: 'main',
        text: "You don't have permission to run image repair. This action requires a platform admin.",
        messageType: 'text',
        payload: null,
        visibleToUser: true,
      });
      return;
    }
    const run = await createAgentRun({
      missionId,
      tenantId: tenantId || missionId,
      agentKey: 'ops',
      triggerMessageId,
      input: {
        objective: 'FIX_IMAGE_MISMATCH',
        entityType: entity.entityType,
        entityId: entity.entityId,
      },
    });
    executeAgentRunInProcess(run.id).catch((err) => {
      console.warn('[agentChatTurn] executeAgentRunInProcess (ops) failed:', err?.message || err);
    });
    return;
  }

  const plannerRun = await createAgentRun({
    missionId,
    tenantId: tenantId || missionId,
    agentKey: 'planner',
    triggerMessageId,
    input: { userMessage: text },
  });
  if (process.env.MISSION_PLANNER_INPROCESS === 'true') {
    executeAgentRunInProcess(plannerRun.id).catch((err) => {
      console.warn('[agentChatTurn] executeAgentRunInProcess (planner) failed:', err?.message || err);
    });
  }
}
