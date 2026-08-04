/**
 * Kimi / Moonshot — OpenAI-compatible chat for llmGateway.
 * Env: KIMI_API_KEY, KIMI_BASE_URL, KIMI_DEFAULT_MODEL, KIMI_ENABLED / KIMI_DISABLED
 */

import { callOpenAIChat } from './openaiChat.js';
import type { LLMProviderChatRequest, LLMProviderChatResponse } from '../llmGatewayTypes.js';

const DEFAULT_BASE_URL = 'https://api.moonshot.cn/v1';
const DEFAULT_MODEL = 'kimi-k2.5';

function isKimiDisabled(): boolean {
  const enabled = String(process.env.KIMI_ENABLED ?? '').trim().toLowerCase();
  if (enabled === 'false' || enabled === '0' || enabled === 'off') return true;
  const disabled = String(process.env.KIMI_DISABLED ?? '').trim().toLowerCase();
  return disabled === '1' || disabled === 'true' || disabled === 'yes';
}

export function resolveKimiModel(explicit?: string): string {
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  return (
    process.env.KIMI_DEFAULT_MODEL?.trim() ||
    process.env.KIMI_MODEL?.trim() ||
    DEFAULT_MODEL
  );
}

export async function callKimiChat(
  request: LLMProviderChatRequest,
): Promise<LLMProviderChatResponse> {
  if (isKimiDisabled()) {
    throw new Error('Kimi provider is disabled (KIMI_ENABLED=false or KIMI_DISABLED)');
  }

  const apiKey = process.env.KIMI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('KIMI_API_KEY is not set');
  }

  const baseURL = (process.env.KIMI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
  const model = resolveKimiModel(request.model);

  return callOpenAIChat(
    { ...request, model },
    { apiKey, baseURL },
  );
}

/** Alias matching Phase 1 naming. */
export const kimiChat = callKimiChat;
