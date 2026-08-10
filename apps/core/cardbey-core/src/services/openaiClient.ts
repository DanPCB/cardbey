/**
 * Chat completion client — Phase 0 routes through llmGateway by default.
 * Rollback: USE_LLM_GATEWAY=false uses deprecated direct OpenAI.
 */

import OpenAI from 'openai';
import { llmGateway } from '../lib/llm/llmGateway.ts';
import { deprecatedOpenAIChatCompletion } from '../lib/llm/directOpenAICall.js';
import { Features } from '../config/features.js';

const DEFAULT_MODEL = process.env.OPENAI_PLANNER_MODEL ?? 'gpt-4o-mini';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60000,
      maxRetries: 2,
    })
  : null;

export interface OpenAIChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OpenAIChatCompleteParams {
  system: string;
  messages: OpenAIChatMessage[];
  model?: string;
}

/**
 * Run a chat completion and return the assistant reply text.
 */
export async function openaiChatComplete(params: OpenAIChatCompleteParams): Promise<string> {
  const { system, messages, model = DEFAULT_MODEL } = params;

  if (Features.llm.useGateway) {
    if (!Features.llm.available) {
      throw new Error('No LLM provider key is set (ANTHROPIC_API_KEY / OPENAI_API_KEY / …)');
    }
    const result = await llmGateway.complete({
      purpose: 'openai_client_chat',
      tenantKey: 'openai-client',
      messages: [
        { role: 'system', content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      provider: Features.llm.defaultProvider,
      // Prefer gateway default model when using non-OpenAI provider; keep explicit OpenAI model on openai provider
      model:
        Features.llm.defaultProvider === 'openai'
          ? model
          : Features.llm.defaultModel ?? undefined,
      temperature: 0.4,
      maxTokens: 1024,
      responseFormat: 'text',
    });
    const text = result.text?.trim();
    if (text == null || text === '') {
      throw new Error('LLM gateway returned no content');
    }
    return text;
  }

  if (!openai) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const response = await deprecatedOpenAIChatCompletion(
    openai,
    {
      model,
      messages: apiMessages,
      temperature: 0.4,
      max_tokens: 1024,
    },
    'services/openaiClient.ts',
  );

  const text = response.choices?.[0]?.message?.content?.trim();
  if (text == null) {
    throw new Error('OpenAI returned no content');
  }
  return text;
}
