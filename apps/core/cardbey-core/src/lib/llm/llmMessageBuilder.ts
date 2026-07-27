/**
 * Build normalized chat messages for llmGateway.
 */

import type { LLMChatMessage, LLMToolResult } from './llmGatewayTypes.js';

export type BuildMessagesInput = {
  messages?: LLMChatMessage[];
  system?: string | null;
  systemPrompt?: string | null;
  prompt?: string | null;
  tool_results?: LLMToolResult[];
};

function normalizeContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content == null) return '';
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function normalizeRole(role: unknown): LLMChatMessage['role'] {
  const r = String(role ?? 'user').toLowerCase();
  if (r === 'system' || r === 'user' || r === 'assistant' || r === 'tool') return r;
  return 'user';
}

/**
 * Merge system/prompt/messages/tool_results into a single message list.
 */
export function buildChatMessages(input: BuildMessagesInput): LLMChatMessage[] {
  const result: LLMChatMessage[] = [];
  const systemText =
    (typeof input.system === 'string' && input.system.trim()) ||
    (typeof input.systemPrompt === 'string' && input.systemPrompt.trim()) ||
    '';

  if (systemText) {
    result.push({ role: 'system', content: systemText });
  }

  const incoming = Array.isArray(input.messages) ? input.messages : [];
  for (const msg of incoming) {
    if (!msg || typeof msg !== 'object') continue;
    const role = normalizeRole(msg.role);
    if (role === 'system' && systemText) continue;
    result.push({
      role,
      content: normalizeContent(msg.content),
      ...(msg.name ? { name: msg.name } : {}),
      ...(Array.isArray(msg.tool_calls) && msg.tool_calls.length
        ? { tool_calls: msg.tool_calls }
        : {}),
      ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
    });
  }

  if (
    typeof input.prompt === 'string' &&
    input.prompt.trim() &&
    !incoming.some((m) => m?.role === 'user')
  ) {
    result.push({ role: 'user', content: input.prompt.trim() });
  }

  const toolResults = Array.isArray(input.tool_results) ? input.tool_results : [];
  for (const tr of toolResults) {
    if (!tr?.tool_call_id) continue;
    result.push({
      role: 'tool',
      tool_call_id: tr.tool_call_id,
      content: normalizeContent(tr.result),
      ...(tr.name ? { name: tr.name } : {}),
    });
  }

  return result;
}

/**
 * Cap message count (preserves leading system when present).
 */
export function capChatMessages(messages: LLMChatMessage[], maxMessages: number): LLMChatMessage[] {
  if (!Number.isFinite(maxMessages) || maxMessages <= 0 || messages.length <= maxMessages) {
    return messages;
  }

  const hasSystem = messages[0]?.role === 'system';
  const system = hasSystem ? [messages[0]] : [];
  const rest = hasSystem ? messages.slice(1) : messages;
  const kept = rest.slice(-(maxMessages - system.length));
  return [...system, ...kept];
}

/**
 * Stable cache key material for multi-message requests.
 */
export function hashChatPayload(messages: LLMChatMessage[], tools?: unknown[]): string {
  return JSON.stringify({ messages, tools: tools ?? [] });
}
