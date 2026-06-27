/**
 * Anthropic Messages API — multi-message + native tool calling.
 */

import { postAnthropicMessages } from '../anthropicProvider.js';
import { resolveAnthropicModel } from '../anthropicModelConfig.js';
import type {
  LLMChatMessage,
  LLMProviderChatRequest,
  LLMProviderChatResponse,
  LLMToolCall,
} from '../llmGatewayTypes.js';

type AnthropicContentBlock = Record<string, unknown>;

function splitSystemAndMessages(messages: LLMChatMessage[]) {
  const systemParts: string[] = [];
  const chatMessages: LLMChatMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      if (msg.content?.trim()) systemParts.push(msg.content.trim());
    } else {
      chatMessages.push(msg);
    }
  }

  return {
    system: systemParts.join('\n\n') || undefined,
    chatMessages,
  };
}

function toAnthropicRole(role: LLMChatMessage['role']): 'user' | 'assistant' {
  return role === 'assistant' ? 'assistant' : 'user';
}

function assistantContentBlocks(msg: LLMChatMessage): AnthropicContentBlock[] {
  const blocks: AnthropicContentBlock[] = [];
  if (msg.content?.trim()) {
    blocks.push({ type: 'text', text: msg.content });
  }
  for (const tc of msg.tool_calls ?? []) {
    blocks.push({
      type: 'tool_use',
      id: tc.id,
      name: tc.name,
      input: tc.parameters ?? {},
    });
  }
  return blocks.length ? blocks : [{ type: 'text', text: '' }];
}

function toAnthropicMessages(messages: LLMChatMessage[]) {
  /** @type {Array<{ role: 'user' | 'assistant', content: AnthropicContentBlock[] | string }>} */
  const out: Array<{ role: 'user' | 'assistant'; content: AnthropicContentBlock[] | string }> = [];

  for (const msg of messages) {
    if (msg.role === 'tool') {
      const last = out[out.length - 1];
      const toolBlock = {
        type: 'tool_result',
        tool_use_id: msg.tool_call_id,
        content: msg.content,
      };
      if (last?.role === 'user' && Array.isArray(last.content)) {
        last.content.push(toolBlock);
      } else {
        out.push({ role: 'user', content: [toolBlock] });
      }
      continue;
    }

    if (msg.role === 'assistant') {
      out.push({ role: 'assistant', content: assistantContentBlocks(msg) });
      continue;
    }

    out.push({
      role: toAnthropicRole(msg.role),
      content: msg.content,
    });
  }

  return out;
}

function parseAnthropicResponse(raw: {
  content?: Array<{ type?: string; text?: string; thinking?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
}): LLMProviderChatResponse {
  const blocks = Array.isArray(raw.content) ? raw.content : [];
  const text = blocks
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
    .trim();

  const thinkingText = blocks
    .filter((b) => b?.type === 'thinking' && typeof b.thinking === 'string')
    .map((b) => b.thinking)
    .join('\n')
    .trim();

  /** @type {LLMToolCall[]} */
  const toolCalls: LLMToolCall[] = [];
  for (const block of blocks) {
    if (block?.type !== 'tool_use') continue;
    toolCalls.push({
      id: String(block.id ?? ''),
      name: String(block.name ?? ''),
      parameters:
        block.input && typeof block.input === 'object' && !Array.isArray(block.input)
          ? { ...block.input }
          : {},
    });
  }

  return {
    content: text,
    tool_calls: toolCalls.length ? toolCalls : null,
    ...(thinkingText ? { thinkingText } : {}),
    model: raw.model,
    inputTokens: raw.usage?.input_tokens ?? 0,
    outputTokens: raw.usage?.output_tokens ?? 0,
    stopReason: raw.stop_reason,
    raw,
  };
}

export async function callAnthropicChat(
  request: LLMProviderChatRequest,
): Promise<LLMProviderChatResponse> {
  const { system, chatMessages } = splitSystemAndMessages(request.messages);
  const model = resolveAnthropicModel(request.model);
  const anthropicMessages = toAnthropicMessages(chatMessages);

  /** @type {Record<string, unknown>} */
  const payload: Record<string, unknown> = {
    model,
    max_tokens: request.maxTokens,
    system,
    messages: anthropicMessages,
    temperature: request.temperature,
  };

  if (request.tools?.length) {
    payload.tools = request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters ?? { type: 'object', properties: {} },
    }));

    if (request.tool_choice === 'none') {
      payload.tool_choice = { type: 'none' };
    } else if (request.tool_choice && request.tool_choice !== 'auto') {
      payload.tool_choice = { type: 'tool', name: request.tool_choice };
    } else {
      payload.tool_choice = { type: 'auto' };
    }
  }

  if (request.thinking) {
    const budget = Math.max(1024, request.thinkingBudget ?? 4096);
    payload.thinking = { type: 'enabled', budget_tokens: budget };
    payload.max_tokens = Math.max(request.maxTokens, budget + 512);
  }

  const raw = (await postAnthropicMessages(payload)) as {
    error?: string;
    content?: Array<Record<string, unknown>>;
    model?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
    stop_reason?: string;
  };

  if (raw?.error) {
    throw new Error(`Anthropic API error: ${raw.error}`);
  }

  return parseAnthropicResponse(raw);
}
