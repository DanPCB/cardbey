/**
 * Bridges Performer intake v2 with continuous conversation persistence.
 */
import conversationService, {
  isPerformerConversationEnabled,
} from './conversationService.js';

const DEFAULT_MAX_HISTORY_TURNS = 10;

export { isPerformerConversationEnabled };

function resolveMaxHistoryTurns() {
  const llmOff = String(process.env.ENABLE_LLM_REASONER ?? '').trim().toLowerCase();
  if (llmOff !== 'false' && llmOff !== '0') {
    const configured = parseInt(process.env.LLM_REASONER_MAX_HISTORY_TURNS || '15', 10);
    return Number.isFinite(configured) && configured > 0 ? configured : 15;
  }
  return DEFAULT_MAX_HISTORY_TURNS;
}

export function getIntakeConversationHistoryLimit() {
  return resolveMaxHistoryTurns();
}

export function mergeConversationHistory(serverHistory, clientHistory) {
  const maxTurns = resolveMaxHistoryTurns();
  const server = Array.isArray(serverHistory) ? serverHistory : [];
  if (server.length > 0) {
    return server.slice(-maxTurns);
  }
  return Array.isArray(clientHistory) ? clientHistory.slice(-maxTurns) : [];
}

export function extractAssistantTextFromIntakePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  const candidates = [
    payload.response,
    payload.message,
    payload.userMessage,
    payload.text,
    payload.reply,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function intakePayloadNeedsPendingAction(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.requiresConfirmation === true) return true;
  if (payload.action === 'confirm' || payload.action === 'needs_input') return true;
  if (payload.kind === 'confirm' || payload.kind === 'clarify') return true;
  return false;
}

/**
 * Bootstrap server-side conversation for an intake request.
 * @returns {Promise<{ session: object|null, context: object|null, history: Array }>}
 */
export async function bootstrapConversationForIntake({
  userId,
  storeId,
  sessionId,
  userMessage,
  missionId,
  clientHistory,
}) {
  const empty = {
    session: null,
    context: null,
    history: mergeConversationHistory([], clientHistory),
  };
  if (!isPerformerConversationEnabled()) return empty;

  const uid = String(userId ?? '').trim();
  if (!uid || !userMessage?.trim()) return empty;
  if (uid.startsWith('guest_')) return empty;

  try {
    const { session, skipped } = await conversationService.getOrCreateSession({
      userId: uid,
      storeId,
      surface: 'performer_console',
      sessionId,
    });
    if (skipped || !session?.id) return empty;

    await conversationService.addMessage({
      sessionId: session.id,
      role: 'user',
      content: userMessage.trim(),
      missionId,
    });

    const context = await conversationService.buildConversationContext(session.id, {
      maxMessages: resolveMaxHistoryTurns(),
    });
    const history = mergeConversationHistory(context.conversationHistory, clientHistory);

    return { session, context, history };
  } catch (err) {
    console.warn('[conversation] bootstrap failed (non-fatal):', err?.message ?? err);
    return empty;
  }
}

/**
 * Persist assistant turn + pending actions; enrich response payload.
 */
export async function finalizeConversationIntakeResponse({
  session,
  context,
  payload,
  missionId,
}) {
  if (!session?.id || !isPerformerConversationEnabled()) {
    return payload;
  }

  let nextPayload =
    payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload } : payload;

  try {
    const assistantText = extractAssistantTextFromIntakePayload(nextPayload);
    const resolvedMissionId =
      missionId ??
      nextPayload?.missionId ??
      nextPayload?.activeMissionId ??
      session.activeMissionId ??
      null;

    if (assistantText) {
      await conversationService.addMessage({
        sessionId: session.id,
        role: 'assistant',
        content: assistantText.slice(0, 8000),
        missionId: resolvedMissionId,
        artifacts:
          nextPayload?.missionId || nextPayload?.dispatchLogId
            ? {
                missionId: nextPayload.missionId ?? null,
                dispatchLogId: nextPayload.dispatchLogId ?? null,
                action: nextPayload.action ?? null,
              }
            : null,
      });
    }

    if (intakePayloadNeedsPendingAction(nextPayload)) {
      await conversationService.addPendingAction({
        sessionId: session.id,
        kind: nextPayload.action === 'confirm' ? 'confirm_action' : 'provide_input',
        proposedAction:
          nextPayload.proposedAction ??
          nextPayload.tool ??
          nextPayload.classificationIntent ??
          null,
        missionId: resolvedMissionId,
        stepId: nextPayload.stepId ?? null,
        payload: {
          action: nextPayload.action ?? null,
          requiresConfirmation: nextPayload.requiresConfirmation ?? false,
        },
      });
    } else if (context?.pendingActions?.length) {
      await conversationService.resolvePendingActionsForSession(session.id, 'resolved');
    }

    if (nextPayload && typeof nextPayload === 'object' && !Array.isArray(nextPayload)) {
      nextPayload = {
        ...nextPayload,
        conversationSessionId: session.id,
        conversationContext: context
          ? {
              pendingActions: context.pendingActions ?? [],
              messageCount: context.messageCount ?? 0,
            }
          : undefined,
      };
    }
  } catch (err) {
    console.warn('[conversation] finalize failed (non-fatal):', err?.message ?? err);
    if (nextPayload && typeof nextPayload === 'object' && !Array.isArray(nextPayload)) {
      nextPayload.conversationSessionId = session.id;
    }
  }

  return nextPayload;
}

export function attachConversationToMissionMetadata(metadata, conversationContext, conversationSessionId = null) {
  if (!conversationContext?.conversationHistory?.length && !conversationSessionId) return metadata;
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...metadata } : {};
  return {
    ...base,
    ...(conversationSessionId ? { conversationSessionId } : {}),
    conversationContext: {
      conversationHistory: (conversationContext?.conversationHistory ?? []).slice(
        -resolveMaxHistoryTurns(),
      ),
      pendingActions: conversationContext?.pendingActions ?? [],
      messageCount: conversationContext?.messageCount ?? 0,
    },
  };
}

/**
 * Persist active store on the conversation session (non-blocking).
 *
 * @param {{ sessionId?: string | null; storeId?: string | null }} opts
 */
export async function persistConversationSessionStoreId({ sessionId, storeId }) {
  const sid = String(sessionId ?? '').trim();
  const resolvedStoreId = String(storeId ?? '').trim();
  if (!sid || !resolvedStoreId || !isPerformerConversationEnabled()) return;

  try {
    await conversationService.updateSessionStoreId(sid, resolvedStoreId);
  } catch (err) {
    console.warn('[conversation] persist session storeId failed (non-fatal):', err?.message ?? err);
  }
}
