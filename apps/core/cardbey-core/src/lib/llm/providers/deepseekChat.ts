/**
 * DeepSeek — OpenAI-compatible multi-message + tool calling.
 *
 * Prefer DEEPSEEK_BASE_URL (cloud). Do not use DEEPSEEK_ENDPOINT when it points at
 * localhost — that env is reserved for the legacy local deepseekAdapter.
 */

import { callOpenAIChat } from './openaiChat.js';
import type { LLMProviderChatRequest, LLMProviderChatResponse } from '../llmGatewayTypes.js';
import {
  resolveDeepSeekApiKey,
  resolveDeepSeekBaseUrl,
  resolveDeepSeekModel,
} from '../deepseekEnv.js';

export async function callDeepSeekChat(
  request: LLMProviderChatRequest,
): Promise<LLMProviderChatResponse> {
  const apiKey = resolveDeepSeekApiKey() || String(process.env.OPENAI_API_KEY ?? '').trim();
  const baseURL = resolveDeepSeekBaseUrl();
  const model = resolveDeepSeekModel(request.model);

  if (!apiKey) {
    return {
      content: '',
      tool_calls: null,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  if (process.env.DEEPSEEK_DEBUG === 'true' || process.env.DEEPSEEK_DEBUG === '1') {
    console.log('[DEEPSEEK-DEBUG]', {
      apiKeyPrefix: `${apiKey.slice(0, 7)}…`,
      apiKeyLength: apiKey.length,
      baseURL,
      model,
      endpointEnv: process.env.DEEPSEEK_ENDPOINT?.trim() || null,
      baseUrlEnv: process.env.DEEPSEEK_BASE_URL?.trim() || null,
    });
  }

  return callOpenAIChat({ ...request, model }, { apiKey, baseURL });
}
