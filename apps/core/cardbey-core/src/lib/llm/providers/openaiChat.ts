/**
 * OpenAI Chat Completions — multi-message + native tool calling.
 */

import OpenAI from 'openai';
import type {
  LLMChatMessage,
  LLMProviderChatRequest,
  LLMProviderChatResponse,
  LLMToolCall,
} from '../llmGatewayTypes.js';

const OPENAI_MODEL_FALLBACKS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];

function isOpenAiModelNotFoundError(err: unknown): boolean {
  const e = err as {
    status?: number;
    message?: string;
    error?: { message?: string; code?: string };
  };
  const blob = `${e?.message ?? ''} ${e?.error?.message ?? ''} ${e?.error?.code ?? ''}`.toLowerCase();
  return (
    e?.status === 404 ||
    /model not found|does not exist|invalid_model|unknown model|model_not_found/i.test(blob)
  );
}

function toOpenAiMessages(messages: LLMChatMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return messages.map((msg) => {
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: msg.tool_call_id ?? '',
        content: msg.content,
      };
    }

    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      return {
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.parameters ?? {}),
          },
        })),
      };
    }

    return {
      role: msg.role === 'system' ? 'system' : msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
      ...(msg.name ? { name: msg.name } : {}),
    };
  });
}

function parseOpenAiMessage(message: OpenAI.Chat.Completions.ChatCompletionMessage): LLMProviderChatResponse {
  /** @type {LLMToolCall[]} */
  const toolCalls: LLMToolCall[] = [];
  for (const tc of message.tool_calls ?? []) {
    if (tc.type !== 'function') continue;
    let parameters: Record<string, unknown> = {};
    try {
      parameters = JSON.parse(tc.function.arguments || '{}');
    } catch {
      parameters = {};
    }
    toolCalls.push({
      id: tc.id,
      name: tc.function.name,
      parameters,
    });
  }

  return {
    content: message.content ?? '',
    tool_calls: toolCalls.length ? toolCalls : null,
    inputTokens: 0,
    outputTokens: 0,
    finishReason: undefined,
  };
}

async function createWithFallback(
  openai: OpenAI,
  primaryModel: string,
  bodyBase: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, 'model'>,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const candidates = [primaryModel, ...OPENAI_MODEL_FALLBACKS].filter(
    (m, i, a) => m && a.indexOf(m) === i,
  );
  let lastErr: unknown;
  for (const tryModel of candidates) {
    try {
      return (await openai.chat.completions.create({
        ...bodyBase,
        model: tryModel,
      })) as OpenAI.Chat.Completions.ChatCompletion;
    } catch (err) {
      lastErr = err;
      if (!isOpenAiModelNotFoundError(err)) throw err;
    }
  }
  throw lastErr;
}

export async function callOpenAIChat(
  request: LLMProviderChatRequest,
  options: { apiKey?: string; baseURL?: string } = {},
): Promise<LLMProviderChatResponse> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      content: '',
      tool_calls: null,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const openai = new OpenAI({
    apiKey,
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
  });

  const body: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, 'model'> = {
    messages: toOpenAiMessages(request.messages),
    max_tokens: request.maxTokens,
    temperature: request.temperature,
    ...(request.responseFormat === 'json'
      ? { response_format: { type: 'json_object' as const } }
      : {}),
  };

  if (request.tools?.length) {
    body.tools = request.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters ?? { type: 'object', properties: {} },
      },
    }));

    if (request.tool_choice === 'none') {
      body.tool_choice = 'none';
    } else if (request.tool_choice && request.tool_choice !== 'auto') {
      body.tool_choice = { type: 'function', function: { name: request.tool_choice } };
    } else {
      body.tool_choice = 'auto';
    }
  }

  const completion = await createWithFallback(openai, request.model, body);
  const choice = completion.choices[0]?.message;
  if (!choice) {
    return {
      content: '',
      tool_calls: null,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      model: completion.model,
      finishReason: completion.choices[0]?.finish_reason ?? undefined,
    };
  }

  const parsed = parseOpenAiMessage(choice);
  return {
    ...parsed,
    model: completion.model,
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
    finishReason: completion.choices[0]?.finish_reason ?? undefined,
    raw: completion,
  };
}

export async function callXaiChat(request: LLMProviderChatRequest): Promise<LLMProviderChatResponse> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return {
      content: '',
      tool_calls: null,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
  return callOpenAIChat(request, { apiKey, baseURL: 'https://api.x.ai/v1' });
}
