/**
 * Extract thinking tokens from DeepSeek / LLM gateway responses.
 */

export interface ThinkingResult {
  thinking: string;
  content: string;
  reasoningTokens: number;
}

type ThinkingSource = {
  choices?: Array<{
    message?: {
      content?: string | null;
      thinking?: string | null;
    };
  }>;
  usage?: {
    reasoning_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
};

export function extractThinkingTokens(response: ThinkingSource): ThinkingResult {
  const message = response.choices?.[0]?.message;
  const thinking = String(message?.thinking ?? '').trim();
  const content = String(message?.content ?? '').trim();
  const reasoningTokens =
    response.usage?.reasoning_tokens ??
    response.usage?.completion_tokens_details?.reasoning_tokens ??
    0;

  return { thinking, content, reasoningTokens };
}

export function extractThinkingFromGateway(response: {
  thinkingText?: string;
  content?: string;
  text?: string;
}): ThinkingResult {
  return {
    thinking: String(response.thinkingText ?? '').trim(),
    content: String(response.content ?? response.text ?? '').trim(),
    reasoningTokens: 0,
  };
}
