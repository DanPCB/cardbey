/**
 * DeepSeek — OpenAI-compatible multi-message + tool calling.
 */

import { callOpenAIChat } from './openaiChat.js';
import type { LLMProviderChatRequest, LLMProviderChatResponse } from '../llmGatewayTypes.js';

export async function callDeepSeekChat(
  request: LLMProviderChatRequest,
): Promise<LLMProviderChatResponse> {
  const apiKey = process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY;
  const baseURL = process.env.DEEPSEEK_ENDPOINT?.trim() || 'https://api.deepseek.com/v1';

  if (!apiKey) {
    return {
      content: '',
      tool_calls: null,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  return callOpenAIChat(request, { apiKey, baseURL });
}
