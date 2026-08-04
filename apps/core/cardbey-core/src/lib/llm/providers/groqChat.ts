/**
 * Groq — OpenAI-compatible chat for llmGateway.
 * Env: GROQ_API_KEY, GROQ_DEFAULT_MODEL, GROQ_ENABLED
 */

import { callOpenAIChat } from './openaiChat.js';
import type { LLMProviderChatRequest, LLMProviderChatResponse } from '../llmGatewayTypes.js';

const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
/** Matches existing groqAdapter default; override via GROQ_DEFAULT_MODEL. */
const DEFAULT_MODEL = 'llama-3.1-8b-instant';

function isGroqDisabled(): boolean {
  const enabled = String(process.env.GROQ_ENABLED ?? '').trim().toLowerCase();
  return enabled === 'false' || enabled === '0' || enabled === 'off';
}

export function resolveGroqModel(explicit?: string): string {
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  return process.env.GROQ_DEFAULT_MODEL?.trim() || process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;
}

export async function callGroqChat(
  request: LLMProviderChatRequest,
): Promise<LLMProviderChatResponse> {
  if (isGroqDisabled()) {
    throw new Error('Groq provider is disabled (GROQ_ENABLED=false)');
  }

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set');
  }

  const model = resolveGroqModel(request.model);

  return callOpenAIChat(
    { ...request, model },
    { apiKey, baseURL: DEFAULT_BASE_URL },
  );
}

/** Alias matching Phase 1 naming. */
export const groqChat = callGroqChat;
