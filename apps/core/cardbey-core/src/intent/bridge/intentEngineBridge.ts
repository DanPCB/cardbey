/**
 * Bridge Intent Engine results to intake V2 response shape.
 */

import type { ExecutionResult, IntentResult } from '../intent.types.js';

/**
 * Whether the intent engine can return immediately without legacy dispatch.
 */
export function isIntentEngineEarlyReturn(result: IntentResult): boolean {
  const { execution, intent, context } = result;

  if (execution.action === 'chat') return true;
  if (execution.action === 'store_picker') return true;
  if (execution.action === 'clarify') return true;

  if (execution.action === 'create_store') {
    return intent.type === 'create_store' || context.status === 'needs_store_creation';
  }

  return false;
}

/** @deprecated use isIntentEngineEarlyReturn */
export function isIntentEngineTerminalResult(result: IntentResult): boolean {
  return isIntentEngineEarlyReturn(result);
}

/**
 * Convert a ready business intent into legacy-compatible classification for dispatch.
 */
export function intentResultToClassification(result: IntentResult): Record<string, unknown> {
  const { execution, intent, context } = result;
  const base = {
    confidence: intent.confidence,
    parameters: execution.parameters ?? {},
    _classificationSource: 'intent_engine',
    _intentEngine: {
      intent: intent.type,
      contextStatus: context.status,
      metrics: result.metrics,
    },
  };

  if (execution.tool) {
    return {
      ...base,
      tool: execution.tool,
      executionPath: execution.executionPath ?? 'proactive_plan',
      message: execution.response,
      ...(execution.tool === 'create_campaign' ? { _compilerEligible: true } : {}),
      ...(context.storeId ? { requiresStore: true, _requiresStore: true } : {}),
    };
  }

  return {
    ...base,
    tool: 'general_chat',
    executionPath: 'chat',
    message: execution.response ?? 'How can I help?',
  };
}

/**
 * Map intent engine execution to intake V2 JSON response.
 */
export function intentResultToIntakeResponse(result: IntentResult): Record<string, unknown> {
  const { execution, intent, context, metrics } = result;
  const base = {
    success: true,
    _intentEngine: {
      intent: intent.type,
      requiresBusiness: intent.requiresBusiness,
      confidence: intent.confidence,
      contextStatus: context.status,
      metrics,
    },
    ...(execution.toolCalls?.length ? { toolCalls: execution.toolCalls } : {}),
    ...(execution.thinkingText ? { thinkingText: execution.thinkingText } : {}),
  };

  switch (execution.action) {
    case 'chat':
      return {
        ...base,
        action: 'chat',
        response: execution.response,
        tool: execution.tool ?? 'general_chat',
        executionPath: execution.executionPath ?? 'direct_action',
      };

    case 'store_picker':
      return {
        ...base,
        action: 'clarify',
        clarifyType: execution.clarifyType ?? 'execution_context_store_picker',
        response: execution.response,
        message: execution.response,
        tool: execution.tool,
        clarifyOptions: execution.clarifyOptions ?? [],
        storeCandidates: execution.storeCandidates ?? [],
        pendingIntent: execution.pendingIntent,
        executionPath: 'clarify',
      };

    case 'create_store':
      return {
        ...base,
        action: 'create_store',
        response: execution.response,
        tool: 'create_store',
        parameters: execution.parameters ?? {},
        executionPath: execution.executionPath ?? 'direct_action',
        ...(execution.storeId ? { storeId: execution.storeId } : {}),
      };

    case 'campaign_creation':
      return {
        ...base,
        action: 'campaign_creation',
        response: execution.response,
        tool: 'create_campaign',
        parameters: execution.parameters ?? {},
        executionPath: execution.executionPath ?? 'proactive_plan',
        ...(execution.storeId ? { storeId: execution.storeId } : {}),
      };

    case 'analytics':
      return {
        ...base,
        action: 'analytics',
        response: execution.response,
        tool: 'get_store_analytics',
        parameters: execution.parameters ?? {},
        executionPath: execution.executionPath ?? 'proactive_plan',
        ...(execution.storeId ? { storeId: execution.storeId } : {}),
      };

    case 'proactive_plan':
      return {
        ...base,
        action: 'proactive_plan',
        response: execution.response,
        tool: execution.tool,
        parameters: execution.parameters ?? {},
        executionPath: execution.executionPath ?? 'proactive_plan',
        ...(execution.storeId ? { storeId: execution.storeId } : {}),
      };

    case 'clarify':
      return {
        ...base,
        action: 'clarify',
        response: execution.response,
        tool: execution.tool,
        clarifyOptions: execution.clarifyOptions ?? [],
        executionPath: 'clarify',
      };

    default:
      return {
        ...base,
        action: 'chat',
        response: execution.response ?? 'How can I help you today?',
        tool: 'general_chat',
        executionPath: 'direct_action',
      };
  }
}

/**
 * Compare shadow intent engine result with legacy classification.
 */
export function compareIntentEngineShadow(
  result: IntentResult,
  legacy: { action?: string; tool?: string; executionPath?: string } | null | undefined,
): {
  shadowIntent: string;
  shadowAction: string;
  legacyAction: string | null;
  legacyTool: string | null;
  agree: boolean;
  divergences: string[];
} {
  const shadowAction = result.execution.action;
  const shadowIntent = result.intent.type;
  const legacyAction = String(legacy?.action ?? legacy?.executionPath ?? '').trim() || null;
  const legacyTool = String(legacy?.tool ?? '').trim() || null;
  const divergences: string[] = [];

  const legacyLooksChat =
    legacyAction === 'chat' ||
    legacyAction === 'direct_action' ||
    legacyTool === 'general_chat';
  const shadowIsChat = shadowAction === 'chat';

  if (shadowIsChat !== legacyLooksChat) {
    divergences.push(`chat mismatch: shadow=${shadowAction} legacy=${legacyAction}/${legacyTool}`);
  }

  if (result.intent.type === 'create_store' && legacyTool && legacyTool !== 'create_store') {
    divergences.push(`create_store mismatch: shadow=${shadowIntent} legacyTool=${legacyTool}`);
  }

  if (result.intent.type === 'create_campaign' && legacyTool && legacyTool !== 'create_campaign') {
    divergences.push(`create_campaign mismatch: shadow=${shadowIntent} legacyTool=${legacyTool}`);
  }

  if (shadowAction === 'store_picker' && legacyAction !== 'clarify' && legacyAction !== 'clarify_store') {
    divergences.push(`store_picker mismatch: shadow=store_picker legacy=${legacyAction}`);
  }

  if (!shadowIsChat && legacyLooksChat && result.intent.requiresBusiness) {
    divergences.push(`business intent classified as chat by legacy: ${shadowIntent}`);
  }

  return {
    shadowIntent,
    shadowAction,
    legacyAction,
    legacyTool,
    agree: divergences.length === 0,
    divergences,
  };
}
