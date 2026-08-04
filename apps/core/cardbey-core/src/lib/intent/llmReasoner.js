/**
 * LLM Reasoner — AI-first intent detection for Performer Intake V2.
 * Uses llmGateway with full conversation history and intake tool registry context.
 */

import { llmGateway } from '../llm/llmGateway.ts';
import { getToolEntry, isRegisteredTool } from '../intake/intakeToolRegistry.js';
import { createReasoningResult } from './utils.ts';
import {
  executeLlmReasonerReadOnlyTool,
} from './llmReasonerReadOnlyTools.js';
import { RagIntegration } from './ragIntegration.js';
import {
  formatToolLoopResultAppend,
  getCachedSystemPrompt,
  inferToolDomainFromText,
  isLlmReasonerLogMemoryUsageEnabled,
  isLlmReasonerLogPromptBytesEnabled,
  measurePromptFromMessages,
  normalizeConversationHistory,
  resolveMaxToolLoopResultSize,
} from './llmReasonerPromptUtils.js';
import { INTENT_TYPE_LIST } from './constants.js';
import { normalizeIntentType } from './unifiedIntent.ts';

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
      const content = truncateTurnContentForBlock(msg?.content);
      if (!content) return '';
      return `${label}: ${content}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function truncateTurnContentForBlock(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

export function buildLlmReasonerPromptForTest(input, options) {
  const locale = options?.locale === 'vi' ? 'vi' : 'en';
  const withToolLoop = options?.withToolLoop === true;
  const text = cleanString(input?.text) || cleanString(input?.originalUserMessage);
  const toolDomain = options?.toolDomain ?? inferToolDomainFromText(text);
  const normalizedOpts = {
    ...options,
    conversationHistory: normalizeConversationHistory(options?.conversationHistory),
  };
  const system = getCachedSystemPrompt(locale, withToolLoop, toolDomain);
  return {
    system,
    user: buildLatestTurnUserPrompt(input, normalizedOpts),
    messages: buildReasonerMessages({ system, input, options: normalizedOpts }),
  };
}

function buildLatestTurnUserPrompt(input, options) {
  const text = cleanString(input?.text) || cleanString(input?.originalUserMessage);
  const locale = options.locale === 'vi' ? 'vi' : 'en';
  const lines = [
    `Locale: ${locale}`,
    '',
    'Mission / session context:',
    formatContextBlock(options.currentContext, options.hydratedContext),
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

function normalizeHistoryRole(role) {
  const r = String(role ?? 'user').toLowerCase();
  return r === 'assistant' ? 'assistant' : 'user';
}

function buildReasonerMessages({ system, input, options, extraUserAppend = '' }) {
  /** @type {Array<{ role: string, content: string }>} */
  const messages = [{ role: 'system', content: system }];
  const history = normalizeConversationHistory(options.conversationHistory);

  for (const turn of history) {
    const content = cleanString(turn?.content);
    if (!content) continue;
    messages.push({ role: normalizeHistoryRole(turn.role), content });
  }

  let userBlock = buildLatestTurnUserPrompt(input, options);
  if (extraUserAppend) {
    userBlock += `\n\n${extraUserAppend}`;
  }
  messages.push({ role: 'user', content: userBlock });
  return messages;
}

function logPromptBuilt(logger, messages, meta = {}, memBefore = null) {
  const metrics = measurePromptFromMessages(messages);
  if (!isLlmReasonerLogPromptBytesEnabled()) {
    return metrics;
  }

  const payload = {
    ...metrics,
    ...meta,
  };

  if (isLlmReasonerLogMemoryUsageEnabled() && memBefore != null) {
    const memAfter = process.memoryUsage().heapUsed;
    payload.promptAllocMB = Math.round(((memAfter - memBefore) / 1024 / 1024) * 100) / 100;
  }

  logger.debug?.('[LLMReasoner] Prompt built', payload);
  return metrics;
}

function logLlmCallComplete(logger, promptMetrics, memBefore, memAfterPrompt) {
  if (!isLlmReasonerLogPromptBytesEnabled() && !isLlmReasonerLogMemoryUsageEnabled()) {
    return null;
  }

  const payload = {
    promptBytes: promptMetrics.promptBytes,
    estimatedTokens: promptMetrics.estimatedTokens,
  };

  if (isLlmReasonerLogMemoryUsageEnabled() && memBefore != null && memAfterPrompt != null) {
    const memAfterCall = process.memoryUsage().heapUsed;
    payload.callAllocMB = Math.round(((memAfterCall - memAfterPrompt) / 1024 / 1024) * 100) / 100;
    payload.totalAllocMB = Math.round(((memAfterCall - memBefore) / 1024 / 1024) * 100) / 100;
  }

  logger.debug?.('[LLMReasoner] LLM call complete', payload);
  return payload.totalAllocMB ?? null;
}

function attachPromptTelemetry(result, promptMetrics, memoryAllocatedMB, extra = {}) {
  result.metadata = {
    ...result.metadata,
    promptBytes: promptMetrics.promptBytes,
    estimatedTokens: promptMetrics.estimatedTokens,
    ...(memoryAllocatedMB != null ? { memoryAllocatedMB } : {}),
    ...extra,
  };
}

function llmParsedToReasoningResult(parsed, input, { minConfidence, reasoningTimeMs }) {
  const rawIntent = cleanString(parsed?.intent) || 'unknown';
  // Phase 2: canonicalize via unified taxonomy (unknown → general_chat)
  const intent = INTENT_TYPE_LIST.includes(rawIntent)
    ? rawIntent
    : normalizeIntentType(rawIntent);
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

async function invokeLlmGateway({
  system,
  user,
  input,
  extraUserAppend = '',
  purpose,
  options = {},
  tools,
  memStart = null,
}) {
  const cfg = resolveLlmInvokeOptions(options);
  const messages = input
    ? buildReasonerMessages({ system, input, options, extraUserAppend })
    : [
        { role: 'system', content: system },
        { role: 'user', content: extraUserAppend ? `${user}\n\n${extraUserAppend}` : user },
      ];

  const memBeforePrompt =
    memStart ?? (isLlmReasonerLogMemoryUsageEnabled() ? process.memoryUsage().heapUsed : null);
  const promptMetrics = logPromptBuilt(options.logger ?? console, messages, {
    purpose,
    historyLength: options.conversationHistory?.length ?? 0,
    toolDomain: options.toolDomain ?? null,
  }, memBeforePrompt);

  const memAfterPrompt = isLlmReasonerLogMemoryUsageEnabled()
    ? process.memoryUsage().heapUsed
    : null;

  const generatePromise = llmGateway.generate({
    purpose,
    messages,
    tenantKey: cfg.tenantKey,
    maxTokens: cfg.maxTokens,
    temperature: cfg.temperature,
    responseFormat: 'json',
    thinking: cfg.thinking,
    thinkingBudget: cfg.thinkingBudget,
    ...(cfg.provider ? { provider: cfg.provider } : {}),
    ...(cfg.model ? { model: cfg.model } : {}),
    ...(Array.isArray(tools) && tools.length ? { tools, tool_choice: 'auto' } : {}),
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`llm_reasoner_timeout_${cfg.timeoutMs}ms`)), cfg.timeoutMs);
  });

  const llmRes = await Promise.race([generatePromise, timeoutPromise]);
  const memoryAllocatedMB = logLlmCallComplete(
    options.logger ?? console,
    promptMetrics,
    memBeforePrompt,
    memAfterPrompt,
  );

  return { llmRes, promptMetrics, memoryAllocatedMB };
}

export class LLMReasoner {
  /**
   * @param {Object} [options]
   * @param {Console} [options.logger]
   * @param {{ track?: (event: string, props: Record<string, unknown>) => void } | null} [options.telemetry]
   */
  constructor({ logger = console, telemetry = null } = {}) {
    this.logger = logger;
    this.telemetry = telemetry;
    this.ragIntegration = new RagIntegration({ logger, telemetry });
  }

  /**
   * @param {string} userId
   * @param {string} sessionId
   * @param {Object} input
   * @param {Object} [options]
   * @returns {Promise<{ ragAppendix: string | null, ragSummary: ReturnType<RagIntegration['getRagSummary']> }>}
   */
  async _maybeFetchRag(userId, sessionId, input, options = {}) {
    const context = options.currentContext ?? input?.currentContext ?? null;
    if (!this.ragIntegration.shouldUseRag(input, context)) {
      return { ragAppendix: null, ragSummary: { hasRag: false, chunkCount: 0, sources: [], topScore: 0 } };
    }

    const query = cleanString(input?.text) || cleanString(input?.originalUserMessage);
    const ragResult = await this.ragIntegration.fetchRagContext(userId, sessionId, query, {
      ...(context && typeof context === 'object' ? context : {}),
      tenantKey: cleanString(options.tenantKey) || cleanString(userId),
    });

    if (!ragResult?.chunks?.length) {
      return { ragAppendix: null, ragSummary: this.ragIntegration.getRagSummary(ragResult) };
    }

    return {
      ragAppendix: this.ragIntegration.formatRagContext(ragResult),
      ragSummary: this.ragIntegration.getRagSummary(ragResult),
    };
  }

  /**
   * @param {import('./intentTypes.js').IntentReasoningResult} result
   * @param {{ hasRag: boolean, chunkCount: number, sources: string[], topScore: number }} ragSummary
   * @param {string | null} ragAppendix
   */
  _attachRagMetadata(result, ragSummary, ragAppendix) {
    const contextUsed = [...(result.metadata?.contextUsed ?? [])];
    if (ragSummary?.hasRag && !contextUsed.includes('rag')) {
      contextUsed.push('rag');
    }

    result.metadata = {
      ...result.metadata,
      ragUsed: Boolean(ragAppendix),
      ragSummary,
      ...(contextUsed.length ? { contextUsed } : {}),
    };
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
    const memStart = isLlmReasonerLogMemoryUsageEnabled() ? process.memoryUsage().heapUsed : null;
    const text = cleanString(input?.text) || cleanString(input?.originalUserMessage);
    const toolDomain = inferToolDomainFromText(text);
    const conversationHistory = normalizeConversationHistory(options.conversationHistory);
    const reasonOptions = { ...options, conversationHistory, toolDomain, logger: this.logger };

    this.logger.debug?.('[LLMReasoner] Starting LLM reasoning', {
      userId,
      sessionId,
      input: text?.slice(0, 100),
      historyLength: conversationHistory.length,
      toolDomain,
    });

    const locale = options.locale === 'vi' ? 'vi' : 'en';
    const system = getCachedSystemPrompt(locale, false, toolDomain);
    const user = buildLatestTurnUserPrompt(input, reasonOptions);
    const { ragAppendix, ragSummary } = await this._maybeFetchRag(userId, sessionId, input, reasonOptions);

    const { llmRes, promptMetrics, memoryAllocatedMB } = await invokeLlmGateway({
      system,
      user,
      input,
      extraUserAppend: ragAppendix ?? '',
      purpose: 'intake:llm_reasoner',
      options: { ...reasonOptions, tenantKey: cleanString(options.tenantKey) || cleanString(userId) },
      memStart,
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

    this._attachRagMetadata(result, ragSummary, ragAppendix);
    attachPromptTelemetry(result, promptMetrics, memoryAllocatedMB);

    this.logger.debug?.('[LLMReasoner] Reasoning complete', {
      userId,
      sessionId,
      intent: result.intent,
      tool: result.tool,
      confidence: result.confidence,
      durationMs: result.metadata?.reasoningTimeMs,
      ragUsed: Boolean(ragAppendix),
      promptBytes: promptMetrics.promptBytes,
      estimatedTokens: promptMetrics.estimatedTokens,
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
    const memStart = isLlmReasonerLogMemoryUsageEnabled() ? process.memoryUsage().heapUsed : null;
    const maxIterations = Math.min(
      Math.max(parseInt(process.env.LLM_TOOL_LOOP_MAX_ITERATIONS || '3', 10) || 3, 1),
      5,
    );
    const maxResultSize = resolveMaxToolLoopResultSize();
    const text = cleanString(input?.text) || cleanString(input?.originalUserMessage);
    const toolDomain = inferToolDomainFromText(text);
    const conversationHistory = normalizeConversationHistory(options.conversationHistory);
    const reasonOptions = { ...options, conversationHistory, toolDomain, logger: this.logger };
    const locale = options.locale === 'vi' ? 'vi' : 'en';
    const system = getCachedSystemPrompt(locale, true, toolDomain);
    const user = buildLatestTurnUserPrompt(input, reasonOptions);
    const { ragAppendix, ragSummary } = await this._maybeFetchRag(userId, sessionId, input, reasonOptions);
    let toolAppendix = ragAppendix ?? '';
    let totalResultSize = 0;
    let toolLoopCapReached = false;
    /** @type {Array<{ tool: string, result: unknown }>} */
    const toolTrace = [];
    let lastPromptMetrics = measurePromptFromMessages([]);
    let lastMemoryAllocatedMB = null;

    for (let i = 0; i < maxIterations; i++) {
      const { llmRes, promptMetrics, memoryAllocatedMB } = await invokeLlmGateway({
        system,
        user,
        input,
        extraUserAppend: toolAppendix,
        purpose: 'intake:llm_reasoner_tool_loop',
        options: { ...reasonOptions, tenantKey: cleanString(options.tenantKey) || cleanString(userId) },
        memStart,
      });
      lastPromptMetrics = promptMetrics;
      lastMemoryAllocatedMB = memoryAllocatedMB;

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
        if (toolLoopCapReached) {
          toolAppendix +=
            '\n\n[Tool loop result cap reached — respond with final JSON only, no further tool calls]';
          continue;
        }

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

        const formatted = formatToolLoopResultAppend(toolCall.name, exec, maxResultSize);
        if (formatted.truncated) {
          this.logger.warn?.('[LLMReasoner] Tool loop result truncated', {
            tool: toolCall.name,
            maxResultSize,
          });
        }

        totalResultSize += formatted.byteLength;
        toolAppendix += formatted.append;

        if (totalResultSize > maxResultSize * 2) {
          this.logger.warn?.('[LLMReasoner] Tool loop result size exceeded cap, stopping tool executions', {
            totalResultSize,
            maxResultSize,
          });
          toolLoopCapReached = true;
        }
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
          toolLoopUsed: true,
          contextUsed: [...(result.metadata?.contextUsed ?? []), 'tool_loop'],
        };
      }
      if (llmRes.thinkingText) {
        result.metadata = {
          ...result.metadata,
          thinkingTrace: llmRes.thinkingText,
        };
      }

      this._attachRagMetadata(result, ragSummary, ragAppendix);
      attachPromptTelemetry(result, lastPromptMetrics, lastMemoryAllocatedMB, {
        toolLoopUsed: toolTrace.length > 0,
        toolLoopSteps: toolTrace.length,
      });

      return result;
    }

    throw new Error('LLM_REASONER_TOOL_LOOP_MAX_ITERATIONS');
  }
}

export default LLMReasoner;
