/**
 * OpenAI API client for chat completions.
 * Uses OPENAI_API_KEY and the official OpenAI client or fetch with Authorization: Bearer.
 */

import OpenAI from 'openai';

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
 * Throws if OPENAI_API_KEY is missing or the API request fails.
 */
export async function openaiChatComplete(params: OpenAIChatCompleteParams): Promise<string> {
  const { system, messages, model = DEFAULT_MODEL } = params;

  if (!openai) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const response = await openai.chat.completions.create({
    model,
    messages: apiMessages,
    temperature: 0.4,
    max_tokens: 1024,
  });

  const text = response.choices?.[0]?.message?.content?.trim();
  if (text == null) {
    throw new Error('OpenAI returned no content');
  }
  return text;
}
