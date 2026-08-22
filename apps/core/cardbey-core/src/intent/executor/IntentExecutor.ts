/**
 * Intent-based execution — no hardcoded runways.
 */

import { buildPerformerStoreSelectionClarify } from '../../lib/intake/accountStoreIntakeGate.js';
import { runToolCallingLoop } from '../../tools/toolCallingService.js';
import type { ContextResult, ExecutionResult, Intent } from '../intent.types.js';

const CAPABILITIES_RESPONSE =
  'I can help you create and manage businesses, launch campaigns, manage products and catalogs, set up loyalty programs, view analytics, and generate marketing content. What would you like to do?';

function chatExecution(response: string): ExecutionResult {
  return {
    action: 'chat',
    response,
    tool: 'general_chat',
    executionPath: 'direct_action',
  };
}

function storePickerExecution(
  context: ContextResult,
  intent: Intent,
  userMessage: string,
): ExecutionResult {
  const clarifyPayload = buildPerformerStoreSelectionClarify({
    stores: context.stores ?? [],
    lockedTool: context.lockedTool ?? 'general_chat',
    userMessage,
    message: context.message,
  });

  return {
    action: 'store_picker',
    response: clarifyPayload.message,
    tool: context.lockedTool ?? 'general_chat',
    clarifyType: 'execution_context_store_picker',
    clarifyOptions: clarifyPayload.options,
    storeCandidates: clarifyPayload.storeCandidates,
    pendingIntent: clarifyPayload.pendingIntent,
    executionPath: 'clarify',
  };
}

function businessExecution(
  intent: Intent,
  context: ContextResult,
  userMessage = '',
): ExecutionResult {
  const storeId = context.storeId ?? null;
  const baseParams = storeId ? { storeId } : {};

  switch (intent.type) {
    case 'create_store':
      return {
        action: 'create_store',
        response: intent.response ?? 'Let me help you create a new business.',
        tool: 'create_store',
        parameters: baseParams,
        storeId,
        executionPath: 'direct_action',
      };
    case 'create_campaign':
      return {
        action: 'campaign_creation',
        response: 'Starting campaign setup.',
        tool: 'create_campaign',
        parameters: { ...baseParams, _compilerEligible: true },
        storeId,
        executionPath: 'proactive_plan',
      };
    case 'setup_loyalty':
      return {
        action: 'proactive_plan',
        response: 'Starting loyalty program setup.',
        tool: 'setup_loyalty_program',
        parameters: baseParams,
        storeId,
        executionPath: 'proactive_plan',
      };
    case 'analytics':
      return {
        action: 'analytics',
        response: 'Opening analytics for your business.',
        tool: 'get_store_analytics',
        parameters: baseParams,
        storeId,
        executionPath: 'proactive_plan',
      };
    case 'manage_catalog':
      return {
        action: 'proactive_plan',
        response: 'Opening product catalog management.',
        tool: 'replace_store_catalog',
        parameters: baseParams,
        storeId,
        executionPath: 'proactive_plan',
      };
    case 'content_edit':
      return {
        action: 'proactive_plan',
        response: intent.response ?? 'Preparing a copy update for your approval.',
        tool: 'code_fix',
        parameters: {
          ...baseParams,
          description: String(userMessage ?? '').trim(),
        },
        storeId,
        executionPath: 'direct_action',
      };
    default:
      return chatExecution(intent.response ?? 'How can I help you today?');
  }
}

/**
 * Execute based on classified intent and evaluated context.
 */
export function executeIntent(
  intent: Intent,
  context: ContextResult,
  userMessage = '',
): ExecutionResult {
  // Non-business intents — immediate chat responses, no store context.
  switch (intent.type) {
    case 'greeting':
      return chatExecution(intent.response ?? 'Hello! How can I help you today?');
    case 'help':
      return chatExecution(
        intent.response ??
          "I'm here to help. You can manage campaigns, products, loyalty, analytics, or create a new business. What would you like to do?",
      );
    case 'capabilities':
      return chatExecution(intent.response ?? CAPABILITIES_RESPONSE);
    case 'question':
    case 'clarify':
      return chatExecution(intent.response ?? 'How can I help you today?');
    default:
      break;
  }

  if (context.status === 'not_required') {
    return chatExecution(intent.response ?? 'How can I help you today?');
  }

  if (context.status === 'needs_store_creation') {
    return {
      action: 'create_store',
      response:
        context.message ??
        "You'll need a business first. Let's create one, then we can continue.",
      tool: 'create_store',
      parameters: {
        deferredIntent: intent.type,
        lockedTool: context.lockedTool,
        source: 'intent_engine_store_prerequisite',
      },
      executionPath: 'direct_action',
    };
  }

  if (context.status === 'needs_store_picker') {
    return storePickerExecution(context, intent, userMessage);
  }

  return businessExecution(intent, context, userMessage);
}

export class IntentExecutor {
  execute(intent: Intent, context: ContextResult, userMessage = ''): ExecutionResult {
    return executeIntent(intent, context, userMessage);
  }

  /**
   * Optional DeepSeek tool-calling enrichment for business intents with resolved context.
   */
  async executeWithToolCalling(
    intent: Intent,
    context: ContextResult,
    userMessage: string,
    opts: {
      userId?: string | null;
      storeId?: string | null;
      missionId?: string | null;
      sessionId?: string | null;
    } = {},
  ): Promise<ExecutionResult> {
    const base = executeIntent(intent, context, userMessage);
    const toolCallingEnabled =
      String(process.env.DEEPSEEK_TOOL_CALLING_ENABLED ?? 'true').trim().toLowerCase() !== 'false';

    const shouldEnrich =
      toolCallingEnabled &&
      context.status === 'ready' &&
      (intent.type === 'analytics' ||
        intent.type === 'create_campaign' ||
        intent.type === 'setup_loyalty' ||
        intent.type === 'manage_catalog' ||
        intent.type === 'question');

    if (!shouldEnrich) return base;

    const storeId = opts.storeId ?? context.storeId ?? null;
    const toolResult = await runToolCallingLoop({
      userMessage,
      context: {
        userId: opts.userId ?? null,
        storeId,
        missionId: opts.missionId ?? null,
        sessionId: opts.sessionId ?? null,
        source: 'intent_executor',
      },
      toolNames:
        intent.type === 'analytics'
          ? ['get_store_metrics', 'fetch_campaign_analytics']
          : intent.type === 'create_campaign'
            ? ['create_campaign', 'fetch_campaign_analytics']
            : intent.type === 'setup_loyalty'
              ? ['setup_loyalty_program']
              : intent.type === 'manage_catalog'
              ? ['update_product_catalog']
              : undefined,
    });

    return {
      ...base,
      response: toolResult.content || base.response,
      toolCalls: toolResult.toolCalls,
      thinkingText: toolResult.thinkingText,
    };
  }
}
