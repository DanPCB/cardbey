/**
 * LLM Reasoner — AI-first intent detection for Performer Intake V2.
 * Uses llmGateway with full conversation history and intake tool registry context.
 */

import { llmGateway } from '../llm/llmGateway.ts';
import {
  formatToolRegistryForPrompt,
  getToolEntry,
  INTAKE_TOOL_REGISTRY,
  isRegisteredTool,
} from '../intake/intakeToolRegistry.js';
import { INTENT_TYPE_LIST } from './constants.js';
import { createReasoningResult } from './utils.ts';
import {
  executeLlmReasonerReadOnlyTool,
  getLlmReasonerReadOnlyToolAllowlist,
} from './llmReasonerReadOnlyTools.js';

export const LLM_REASONER_VERSION = '1.0.0';

const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_TIMEOUT_MS = 15000;

function cleanString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(Math.max(n, 0), 1);
}

function parseJsonFromLlmText(raw) {
  const t = cleanString(raw);
  if (!t) return null;
  const stripped = t
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

function intentToTool(intent) {
  const map = {
    add_product: 'replace_store_catalog',
    create_campaign: 'create_campaign',
    launch_campaign: 'launch_campaign',
    publish_store: 'publish_store',
    create_store: 'create_store',
    upload_asset: 'upload_store_asset',
    generate_graphic: 'create_promotion_graphic',
    setup_loyalty: 'setup_loyalty_program',
    view_analytics: 'get_store_analytics',
    analyze_asset: 'ingest_asset_for_intent_detection',
    create_promotion: 'create_promotion',
  };
  return map[intent] ?? null;
}

function resolveAction(intent, tool, confidence, minConfidence) {
  if (intent === 'clarification' || confidence < minConfidence) {
    return { action: 'ask_clarification', requiresClarification: true };
  }
  if (tool && isRegisteredTool(tool)) {
    return { action: 'execute_tool', requiresClarification: false };
  }
  if (intent === 'general_chat' || intent === 'get_help') {
    return { action: 'show_help', requiresClarification: false };
  }
  if (intent === 'create_store_first' || intent === 'guide_to_sign_in') {
    return { action: 'guide_to_sign_in', requiresClarification: false };
  }
  if (intent === 'create_store') {
    return { action: 'start_new_workflow', requiresClarification: false };
  }
  return { action: 'execute_tool', requiresClarification: false };
}

function formatContextBlock(currentContext, hydratedContext) {
  const ctx =
    currentContext && typeof currentContext === 'object' && !Array.isArray(currentContext)
      ? currentContext
      : {};
  const hydrated =
    hydratedContext && typeof hydratedContext === 'object' && !Array.isArray(hydratedContext)
      ? hydratedContext
      : null;

  const lines = [];
  const storeId =
    cleanString(ctx.activeStoreId) ||
    cleanString(ctx.storeId) ||
    cleanString(hydrated?.entities?.store?.id);
  const storeName =
    cleanString(ctx.activeStoreName) || cleanString(hydrated?.entities?.store?.name);
  const draftId = cleanString(ctx.activeDraftId) || cleanString(ctx.draftId);
  const missionId = cleanString(ctx.activeMissionId) || cleanString(ctx.missionId);
  const workflow = cleanString(ctx.currentWorkflow) || cleanString(ctx.currentFlow);

  if (storeId) lines.push(`Active store: ${storeId}${storeName ? ` (${storeName})` : ''}`);
  if (draftId) lines.push(`Draft store: ${draftId}`);
  if (missionId) lines.push(`Active mission: ${missionId}`);
  if (workflow) lines.push(`Current workflow: ${workflow}`);

  if (hydrated?.entities?.store?.name && !storeName) {
    lines.push(`Store name (hydrated): ${hydrated.entities.store.name}`);
  }

  return lines.length ? lines.join('\n') : 'No active store, draft, or mission context.';
}

function formatHistoryBlock(history) {
  if (!Array.isArray(history) || history.length === 0) return '(no prior turns)';
  return history
    .map((msg) => {
      const role = cleanString(msg?.role) || 'unknown';
      const label = role === 'assistant' || role === 'agent' ? 'Assistant' : 'User';
      let content = msg?.content;
      if (content == null) return '';
      if (typeof content !== 'string') {
        try {
          content = JSON.stringify(content);
        } catch {
          content = String(content);
        }
      }
      return `${label}: ${content}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function formatToolSchemaAppendix() {
  return INTAKE_TOOL_REGISTRY.map((t) => {
    const required = Array.isArray(t.requiredParams) ? t.requiredParams : [];
    const optional = Array.isArray(t.optionalParams) ? t.optionalParams.slice(0, 6) : [];
    const props = t.parameterSchema?.properties
      ? Object.keys(t.parameterSchema.properties).slice(0, 8).join(', ')
      : '';
    return `- ${t.toolName}: required=[${required.join(', ')}] optional=[${optional.join(', ')}]${props ? ` schema_keys=${props}` : ''}`;
  }).join('\n');
}

export function buildLlmReasonerPromptForTest(input, options) {
  const locale = options?.locale === 'vi' ? 'vi' : 'en';
  const withToolLoop = options?.withToolLoop === true;
  return {
    system: buildSystemPrompt(locale, withToolLoop),
    user: buildUserPrompt(input, options),
  };
}

function buildToolLoopSystemAppendix() {
  const allow = getLlmReasonerReadOnlyToolAllowlist();
  return `

## Optional context-gathering (ReAct tool loop)
Before your final answer you MAY request read-only context tools (one at a time).
Allowed read-only tools: ${allow.join(', ')}

To request a tool, respond with JSON only:
{
  "phase": "tool_call",
  "tool_call": { "name": "<allowed toolName>", "parameters": { } },
  "reasoning": "why you need this data"
}

When ready to decide intent, respond with JSON only:
{
  "phase": "final",
  "intent": "...",
  "tool": "...",
  "parameters": { },
  "confidence": 0.0,
  "reasoning": "..."
}`;
}

function buildSystemPrompt(locale, withToolLoop = false) {
  const langLine =
    locale === 'vi'
      ? 'Respond in Vietnamese for any natural-language strings in JSON values.'
      : 'Respond in English for any natural-language strings in JSON values.';
  const intentList = INTENT_TYPE_LIST.join(' | ');

  return `You are Performer Intake — Cardbey's reasoning engine for store and marketing operations.

Analyze the user's latest message using the full conversation history and mission context.
Think step-by-step about what the user wants, which registered tool best matches, and what parameters are needed.

${langLine}

CRITICAL: Output MUST be ONLY valid JSON. No markdown fences. No prose outside JSON.

## Registered tools (choose toolName exactly as listed)
${formatToolRegistryForPrompt()}

## Tool parameter reference
${formatToolSchemaAppendix()}

## Rules
- Prefer a registered tool when the user wants an action that changes data or runs a workflow.
- Use tool null with intent general_chat only for pure conversation with no actionable request.
- Use intent clarification when critical information is missing (e.g. which store, which product).
- Never invent tool names not in the registry.
- Extract parameters from the user message and context; use storeId/draftId from context when omitted.
- For multi-step campaign flows, respect tool prerequisites (market_research before create_promotion before launch_campaign).

Return this exact JSON shape:
{
  "intent": "<one of: ${intentList}>",
  "tool": "<registered toolName or null>",
  "parameters": { },
  "confidence": 0.0,
  "reasoning": "<step-by-step explanation of your analysis>"
}${withToolLoop ? buildToolLoopSystemAppendix() : ''}`;
}

function buildUserPrompt(input, options) {
  const text = cleanString(input?.text) || cleanString(input?.originalUserMessage);
  const locale = options.locale === 'vi' ? 'vi' : 'en';
  const lines = [
    `Locale: ${locale}`,
    '',
    'Mission / session context:',
    formatContextBlock(options.currentContext, options.hydratedContext),
    '',
    'Conversation history (oldest to newest):',
    formatHistoryBlock(options.conversationHistory),
    '',
    'Latest user message:',
    text || '(empty — user may have attached media only)',
  ];

  if (input?.extractedText) {
    lines.push('', `OCR / extracted attachment text:\n${String(input.extractedText)}`);
  }
  if (input?.hasAttachment || input?.attachments?.length || input?.imageDataUrl) {
    lines.push('', 'Note: user attached media this turn.');
  }
  if (input?.storeCreateForm && typeof input.storeCreateForm === 'object') {
    lines.push('', `Store creation form (structured):\n${JSON.stringify(input.storeCreateForm, null, 2)}`);
  }

  return lines.join('\n');
}

function llmParsedToReasoningResult(parsed, input, { minConfidence, reasoningTimeMs }) {
  const rawIntent = cleanString(parsed?.intent) || 'unknown';
  const intent = INTENT_TYPE_LIST.includes(rawIntent) ? rawIntent : 'general_chat';
  const confidence = clampConfidence(parsed?.confidence);
  const reasoningText = cleanString(parsed?.reasoning) || 'LLM reasoning completed.';

  let tool = cleanString(parsed?.tool) || null;
  if (tool && !isRegisteredTool(tool)) {
    tool = intentToTool(intent);
  }
  if (!tool) {
    tool = intentToTool(intent);
  }

  const parameters =
    parsed?.parameters && typeof parsed.parameters === 'object' && !Array.isArray(parsed.parameters)
      ? { ...parsed.parameters }
      : {};

  const { action, requiresClarification } = resolveAction(intent, tool, confidence, minConfidence);

  const result = createReasoningResult(intent, confidence, action, [reasoningText], {
    reasoningTimeMs,
    contextUsed: ['conversation', 'tool_registry', 'session'],
    sources: ['llm'],
    version: LLM_REASONER_VERSION,
  });

  result.tool = tool;
  result.parameters = parameters;
  result.requiresClarification = requiresClarification;
  result.clarificationPrompt = requiresClarification ? reasoningText : null;

  if (action === 'show_help' && !tool) {
    result.tool = 'general_chat';
  }

  const entry = tool ? getToolEntry(tool) : null;
  if (entry && action === 'execute_tool') {
    result.metadata = {
      ...result.metadata,
      executionPathHint: entry.executionPath,
    };
  }

  void input;
  return result;
}

function extractToolCall(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.phase === 'final') return null;
  const tc = parsed.tool_call;
  if (tc && typeof tc === 'object' && typeof tc.name === 'string' && tc.name.trim()) {
    return {
      name: tc.name.trim(),
      parameters:
        tc.parameters && typeof tc.parameters === 'object' && !Array.isArray(tc.parameters)
          ? tc.parameters
          : {},
    };
  }
  if (parsed.phase === 'tool_call' && typeof parsed.tool === 'string' && parsed.tool.trim()) {
    return {
      name: parsed.tool.trim(),
      parameters:
        parsed.parameters && typeof parsed.parameters === 'object' && !Array.isArray(parsed.parameters)
          ? parsed.parameters
          : {},
    };
  }
  return null;
}

function isFinalPhase(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  if (parsed.phase === 'final') return true;
  if (parsed.phase === 'tool_call') return false;
  return Boolean(parsed.intent);
}

function resolveLlmInvokeOptions(options = {}) {
  const maxTokens = parseInt(process.env.LLM_REASONER_MAX_TOKENS || String(DEFAULT_MAX_TOKENS), 10);
  const temperature = parseFloat(process.env.LLM_REASONER_TEMPERATURE || String(DEFAULT_TEMPERATURE));
  const timeoutMs = parseInt(process.env.LLM_REASONER_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10);
  const thinkingEnabled =
    options.thinking === true || String(process.env.ENABLE_LLM_THINKING ?? '').trim().toLowerCase() === 'true';
  const thinkingBudget = parseInt(process.env.LLM_THINKING_BUDGET || '4096', 10);
  const provider =
    cleanString(options.provider) ||
    cleanString(process.env.LLM_REASONER_PROVIDER) ||
    (thinkingEnabled ? 'anthropic' : undefined);
  const model =
    cleanString(options.model) ||
    cleanString(process.env.LLM_REASONER_MODEL) ||
    (thinkingEnabled ? cleanString(process.env.LLM_THINKING_MODEL) || undefined : undefined);

  return {
    maxTokens: Number.isFinite(maxTokens) ? maxTokens : DEFAULT_MAX_TOKENS,
    temperature: Number.isFinite(temperature) ? temperature : DEFAULT_TEMPERATURE,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS,
    tenantKey: cleanString(options.tenantKey) || 'intake-llm-reasoner',
    thinking: thinkingEnabled,
    thinkingBudget: Number.isFinite(thinkingBudget) ? thinkingBudget : 4096,
    provider,
    model,
  };
}

async function invokeLlmGateway({ system, user, extraUserAppend = '', purpose, options = {} }) {
  const cfg = resolveLlmInvokeOptions(options);
  const userBlock = extraUserAppend ? `${user}\n\n${extraUserAppend}` : user;

  const generatePromise = llmGateway.generate({
    purpose,
    prompt: userBlock,
    systemPrompt: system,
    tenantKey: cfg.tenantKey,
    maxTokens: cfg.maxTokens,
    temperature: cfg.temperature,
    responseFormat: 'json',
    thinking: cfg.thinking,
    thinkingBudget: cfg.thinkingBudget,
    ...(cfg.provider ? { provider: cfg.provider } : {}),
    ...(cfg.model ? { model: cfg.model } : {}),
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`llm_reasoner_timeout_${cfg.timeoutMs}ms`)), cfg.timeoutMs);
  });

  return Promise.race([generatePromise, timeoutPromise]);
}

export class LLMReasoner {
  /**
   * @param {Object} [options]
   * @param {Console} [options.logger]
   */
  constructor({ logger = console } = {}) {
    this.logger = logger;
  }

  /**
   * Reason about user intent using LLM.
   *
   * @param {string} userId
   * @param {string} sessionId
   * @param {Object} input
   * @param {Object} [options]
   * @param {Array<{ role?: string, content?: string }>} [options.conversationHistory]
   * @param {Object} [options.currentContext]
   * @param {Object} [options.hydratedContext]
   * @param {string} [options.tenantKey]
   * @param {string} [options.locale]
   * @returns {Promise<import('./intentTypes.js').IntentReasoningResult>}
   */
  async reason(userId, sessionId, input, options = {}) {
    const startTime = Date.now();
    const history = Array.isArray(options.conversationHistory) ? options.conversationHistory : [];

    this.logger.debug?.('[LLMReasoner] Starting LLM reasoning', {
      userId,
      sessionId,
      input: input?.text?.slice(0, 100),
      historyLength: history.length,
    });

    const locale = options.locale === 'vi' ? 'vi' : 'en';
    const system = buildSystemPrompt(locale, false);
    const user = buildUserPrompt(input, options);

    const llmRes = await invokeLlmGateway({
      system,
      user,
      purpose: 'intake:llm_reasoner',
      options: { ...options, tenantKey: cleanString(options.tenantKey) || cleanString(userId) },
    });

    const rawText = cleanString(llmRes?.text);
    if (!rawText) {
      throw new Error('LLM_REASONER_EMPTY_RESPONSE');
    }

    const parsed = parseJsonFromLlmText(rawText);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('LLM_REASONER_PARSE_FAILED');
    }

    const minConfidence = parseFloat(process.env.INTENT_REASONER_MIN_CONFIDENCE || '0.7');
    const result = llmParsedToReasoningResult(parsed, input, {
      minConfidence: Number.isFinite(minConfidence) ? minConfidence : 0.7,
      reasoningTimeMs: Date.now() - startTime,
    });

    if (llmRes.thinkingText) {
      result.metadata = {
        ...result.metadata,
        thinkingTrace: llmRes.thinkingText,
      };
    }

    this.logger.debug?.('[LLMReasoner] Reasoning complete', {
      userId,
      sessionId,
      intent: result.intent,
      tool: result.tool,
      confidence: result.confidence,
      durationMs: result.metadata?.reasoningTimeMs,
    });

    return result;
  }

  /**
   * ReAct loop: LLM may call read-only context tools before final intent JSON.
   *
   * @param {string} userId
   * @param {string} sessionId
   * @param {Object} input
   * @param {Object} [options]
   * @returns {Promise<import('./intentTypes.js').IntentReasoningResult>}
   */
  async reasonWithTools(userId, sessionId, input, options = {}) {
    const startTime = Date.now();
    const maxIterations = Math.min(
      Math.max(parseInt(process.env.LLM_TOOL_LOOP_MAX_ITERATIONS || '3', 10) || 3, 1),
      5,
    );
    const locale = options.locale === 'vi' ? 'vi' : 'en';
    const system = buildSystemPrompt(locale, true);
    const user = buildUserPrompt(input, options);
    let toolAppendix = '';
    /** @type {Array<{ tool: string, result: unknown }>} */
    const toolTrace = [];

    for (let i = 0; i < maxIterations; i++) {
      const llmRes = await invokeLlmGateway({
        system,
        user,
        extraUserAppend: toolAppendix,
        purpose: 'intake:llm_reasoner_tool_loop',
        options: { ...options, tenantKey: cleanString(options.tenantKey) || cleanString(userId) },
      });

      const rawText = cleanString(llmRes?.text);
      if (!rawText) {
        throw new Error('LLM_REASONER_EMPTY_RESPONSE');
      }

      const parsed = parseJsonFromLlmText(rawText);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('LLM_REASONER_PARSE_FAILED');
      }

      const toolCall = extractToolCall(parsed);
      if (toolCall && !isFinalPhase(parsed)) {
        const exec = await executeLlmReasonerReadOnlyTool(toolCall.name, toolCall.parameters, {
          userId,
          sessionId,
          currentContext: options.currentContext,
          hydratedContext: options.hydratedContext,
          storeId:
            toolCall.parameters?.storeId ??
            options.currentContext?.activeStoreId ??
            options.currentContext?.storeId ??
            null,
        });
        toolTrace.push({ tool: toolCall.name, result: exec });
        toolAppendix += `\n\nTool result for ${toolCall.name}:\n${JSON.stringify(exec, null, 2)}`;
        continue;
      }

      const minConfidence = parseFloat(process.env.INTENT_REASONER_MIN_CONFIDENCE || '0.7');
      const result = llmParsedToReasoningResult(parsed, input, {
        minConfidence: Number.isFinite(minConfidence) ? minConfidence : 0.7,
        reasoningTimeMs: Date.now() - startTime,
      });

      if (toolTrace.length) {
        result.metadata = {
          ...result.metadata,
          toolLoopTrace: toolTrace,
          contextUsed: [...(result.metadata?.contextUsed ?? []), 'tool_loop'],
        };
      }
      if (llmRes.thinkingText) {
        result.metadata = {
          ...result.metadata,
          thinkingTrace: llmRes.thinkingText,
        };
      }

      return result;
    }

    throw new Error('LLM_REASONER_TOOL_LOOP_MAX_ITERATIONS');
  }
}

export default LLMReasoner;
