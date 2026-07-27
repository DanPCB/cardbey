/**
 * LLM Gateway — multi-message + tool calling types.
 */

export type LLMMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type LLMToolCall = {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
};

export type LLMChatMessage = {
  role: LLMMessageRole;
  content: string;
  name?: string;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
};

export type LLMToolDefinition = {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
};

export type LLMToolResult = {
  tool_call_id: string;
  result: unknown;
  name?: string;
};

export type LLMProviderChatRequest = {
  messages: LLMChatMessage[];
  tools?: LLMToolDefinition[];
  tool_choice?: 'auto' | 'none' | string;
  maxTokens: number;
  temperature: number;
  model: string;
  thinking?: boolean;
  thinkingBudget?: number;
  responseFormat?: 'text' | 'json';
  timeoutMs?: number;
  purpose?: string;
};

export type LLMProviderChatResponse = {
  content: string;
  tool_calls: LLMToolCall[] | null;
  thinkingText?: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  stopReason?: string;
  finishReason?: string;
  raw?: unknown;
};

export type LLMGatewayOptions = {
  purpose: string;
  tenantKey: string;

  /** Multi-message chat (preferred). */
  messages?: LLMChatMessage[];

  /** Legacy single-turn prompt. */
  prompt?: string;

  /** System instruction (legacy alias: systemPrompt). */
  system?: string;
  systemPrompt?: string;

  /** Native tool schemas. */
  tools?: LLMToolDefinition[];
  tool_choice?: 'auto' | 'none' | string;

  /** Inject tool results before the provider call (ReAct continuation). */
  tool_results?: LLMToolResult[];

  /** After tool_results, call provider again with appended tool messages. */
  autoContinueAfterToolResults?: boolean;

  model?: string;
  provider?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'text' | 'json';
  thinking?: boolean;
  thinkingBudget?: number;
  timeoutMs?: number;
};

export type LLMResult = {
  text: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
  cached: boolean;
  thinkingText?: string;
  tool_calls?: LLMToolCall[] | null;
  model?: string;
  stopReason?: string;
  finishReason?: string;
};
