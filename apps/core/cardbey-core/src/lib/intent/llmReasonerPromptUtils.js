/**
 * Prompt sizing helpers for LLM Reasoner — history caps, tool domain filtering, system prompt cache.
 */

import { formatToolRegistryForPrompt } from '../intake/intakeToolRegistry.js';
import { INTENT_TYPE_LIST } from './constants.js';
import { getLlmReasonerReadOnlyToolAllowlist } from './llmReasonerReadOnlyTools.js';

/** Domain → intake tool names (subset of registry). Empty default = all tools. */
export const INTENT_TOOL_MAP = {
  create_store: [
    'create_store',
    'validate_store_context',
    'structured_store_build',
    'analyze_store',
    'capture_requirements',
    'publish_store',
    'general_chat',
  ],
  publish_store: [
    'publish_store',
    'validate_store_context',
    'analyze_store',
    'audit_store_completeness',
    'general_chat',
  ],
  add_product: [
    'validate_store_context',
    'prepare_catalog',
    'replace_store_catalog',
    'validate_products',
    'finalize_catalog',
    'general_chat',
  ],
  create_campaign: [
    'market_research',
    'create_promotion',
    'create_campaign',
    'launch_campaign',
    'validate_store_context',
    'general_chat',
  ],
  generate_graphic: [
    'create_promotion_graphic',
    'smart_visual',
    'generate_campaign_graphics',
    'validate_store_context',
    'general_chat',
  ],
};

export const UNAMBIGUOUS_DETERMINISTIC_INTENTS = new Set(['create_store', 'publish_store']);

export const LLM_MEMORY_ALLOCATION_THRESHOLD = 0.9;

/** @type {Map<string, string>} */
const systemPromptCache = new Map();

export function resolveMaxHistoryTurns() {
  const n = parseInt(process.env.LLM_REASONER_MAX_HISTORY_TURNS || '15', 10);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

export function resolveMaxTurnLength() {
  const n = parseInt(process.env.LLM_REASONER_MAX_TURN_LENGTH || '1000', 10);
  return Number.isFinite(n) && n > 0 ? n : 1000;
}

/**
 * @param {unknown} content
 * @param {number} maxLen
 */
export function truncateTurnContent(content, maxLen) {
  if (content == null) return '';
  let text = typeof content === 'string' ? content : '';
  if (!text) {
    try {
      text = JSON.stringify(content);
    } catch {
      text = String(content);
    }
  }
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

/**
 * @param {Array<{ role?: string, content?: unknown }> | null | undefined} history
 */
export function normalizeConversationHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return [];
  const maxTurns = resolveMaxHistoryTurns();
  const maxLen = resolveMaxTurnLength();
  return history.slice(-maxTurns).map((turn) => ({
    ...turn,
    content: truncateTurnContent(turn?.content, maxLen),
  }));
}

/**
 * @param {string} text
 * @returns {keyof typeof INTENT_TOOL_MAP | null}
 */
export function inferToolDomainFromText(text) {
  const t = String(text ?? '').toLowerCase();
  if (!t.trim()) return null;

  if (
    /\bpublish\b/.test(t) &&
    /\b(store|shop|site|website)\b/.test(t)
  ) {
    return 'publish_store';
  }

  if (
    /(create|build|open|set up|setup|start|make|help me to create|help me create).*(store|shop|business)/i.test(
      t,
    ) ||
    /(store|shop|business).*(create|build|open|set up|setup)/i.test(t)
  ) {
    return 'create_store';
  }

  if (/\b(add|upload|import)\b.*\b(product|menu item|catalog)/i.test(t)) {
    return 'add_product';
  }

  if (/\b(campaign|promotion|marketing)\b/i.test(t) && /\b(create|launch|run|start)\b/i.test(t)) {
    return 'create_campaign';
  }

  if (/\b(graphic|poster|banner|visual|image)\b/i.test(t) && /\b(create|generate|make|design)\b/i.test(t)) {
    return 'generate_graphic';
  }

  return null;
}

/**
 * @param {keyof typeof INTENT_TOOL_MAP | null | undefined} domain
 */
export function resolveToolNamesForDomain(domain) {
  if (!domain || !INTENT_TOOL_MAP[domain]?.length) return null;
  return INTENT_TOOL_MAP[domain];
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

/**
 * @param {'en'|'vi'} locale
 * @param {boolean} withToolLoop
 * @param {keyof typeof INTENT_TOOL_MAP | null} toolDomain
 */
export function buildSystemPrompt(locale, withToolLoop = false, toolDomain = null) {
  const langLine =
    locale === 'vi'
      ? 'Respond in Vietnamese for any natural-language strings in JSON values.'
      : 'Respond in English for any natural-language strings in JSON values.';
  const intentList = INTENT_TYPE_LIST.join(' | ');
  const toolNames = resolveToolNamesForDomain(toolDomain);

  return `You are Performer Intake — Cardbey's reasoning engine for store and marketing operations.

Analyze the user's latest message using the full conversation history and mission context.
Think step-by-step about what the user wants, which registered tool best matches, and what parameters are needed.

${langLine}

CRITICAL: Output MUST be ONLY valid JSON. No markdown fences. No prose outside JSON.

## Registered tools (choose toolName exactly as listed)
${formatToolRegistryForPrompt({ toolNames })}

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

/**
 * @param {'en'|'vi'} locale
 * @param {boolean} withToolLoop
 * @param {keyof typeof INTENT_TOOL_MAP | null} toolDomain
 */
export function getCachedSystemPrompt(locale, withToolLoop = false, toolDomain = null) {
  const key = `${locale}:${withToolLoop ? '1' : '0'}:${toolDomain ?? 'all'}`;
  const cached = systemPromptCache.get(key);
  if (cached) return cached;
  const built = buildSystemPrompt(locale, withToolLoop, toolDomain);
  systemPromptCache.set(key, built);
  return built;
}

export function resetSystemPromptCacheForTests() {
  systemPromptCache.clear();
}

/**
 * @param {import('node:process').MemoryUsage} [memUsage]
 */
export function isLlmMemoryPressureHigh(memUsage = process.memoryUsage()) {
  if (!memUsage?.heapTotal) return false;
  return memUsage.heapUsed / memUsage.heapTotal > LLM_MEMORY_ALLOCATION_THRESHOLD;
}

function envTruthy(name, defaultValue = true) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return String(raw).trim().toLowerCase() === 'true';
}

export function isLlmReasonerLogPromptBytesEnabled() {
  return envTruthy('LLM_REASONER_LOG_PROMPT_BYTES', true);
}

export function isLlmReasonerLogMemoryUsageEnabled() {
  return envTruthy('LLM_REASONER_LOG_MEMORY_USAGE', true);
}

export function isLlmReasonerTelemetryEnabled() {
  return envTruthy('LLM_REASONER_TELEMETRY_ENABLED', true);
}

export function resolveMaxToolLoopResultSize() {
  const n = parseInt(process.env.LLM_TOOL_LOOP_MAX_RESULT_SIZE || '4096', 10);
  return Number.isFinite(n) && n > 0 ? n : 4096;
}

/**
 * @param {Array<{ content?: string }>} messages
 */
export function measurePromptFromMessages(messages) {
  const serialized = (Array.isArray(messages) ? messages : [])
    .map((m) => (typeof m?.content === 'string' ? m.content : ''))
    .join('\n');
  const promptBytes = Buffer.byteLength(serialized, 'utf8');
  return {
    promptBytes,
    charLength: serialized.length,
    estimatedTokens: Math.round(promptBytes / 4),
  };
}

/**
 * @param {unknown} exec
 * @param {number} [maxSize]
 */
export function formatToolLoopResultAppend(toolName, exec, maxSize = resolveMaxToolLoopResultSize()) {
  let resultStr = JSON.stringify(exec, null, 2);
  let truncated = false;
  if (resultStr.length > maxSize) {
    resultStr = `${resultStr.slice(0, maxSize)}...[truncated]`;
    truncated = true;
  }
  return {
    append: `\n\nTool result for ${toolName}:\n${resultStr}`,
    byteLength: resultStr.length,
    truncated,
  };
}
