/**
 * Base agent class — LLM calls via llmGateway (Phase 2).
 * Default provider: deepseek (MULTIAGENT_PROVIDER / per-agent AGENT_*_PROVIDER).
 * Rollback: MULTIAGENT_USE_GATEWAY=false uses deprecated direct OpenAI SDK → DeepSeek.
 */

import OpenAI from 'openai';
import type {
  AgentConfig,
  AgentType,
  ThinkingConfig,
} from '../types/agent.types.js';
import { loadDeepSeekConfig, loadFallbackConfig } from '../config/deepseek.config.js';
import logger from '../telemetry/logger.js';
import { retryWithBackoff } from '../utils/retry.js';
import { globalRequestCache } from '../utils/cache.js';
import { llmGateway } from '../../lib/llm/llmGateway.ts';
import type { LLMChatMessage, LLMResult, LLMToolDefinition } from '../../lib/llm/llmGatewayTypes.js';
import { Features } from '../../config/features.js';

export interface DeepSeekCallOptions {
  responseFormat?: { type: 'json_object' };
  useCache?: boolean;
  cacheKey?: string;
}

export interface DeepSeekCallMeta {
  tokensUsed: number;
  durationMs: number;
  model: string;
  provider: string;
}

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

let sharedClient: OpenAI | null = null;
let warnedDirectClient = false;

function warnDirectDeepSeekClient(caller: string): void {
  if (warnedDirectClient) return;
  warnedDirectClient = true;
  console.warn(
    `[DEPRECATED] Direct multiAgent DeepSeek client (${caller}). ` +
      'Use llmGateway with provider "deepseek" (default). ' +
      'Rollback: MULTIAGENT_USE_GATEWAY=false.',
  );
}

function getSharedClient(): OpenAI {
  warnDirectDeepSeekClient('BaseAgent.getSharedClient');
  if (!sharedClient) {
    const cfg = loadDeepSeekConfig();
    sharedClient = new OpenAI({
      apiKey: cfg.apiKey || 'missing-key',
      baseURL: cfg.baseUrl,
      timeout: cfg.timeoutMs,
      maxRetries: 0,
    });
  }
  return sharedClient;
}

export function resetSharedClientForTests(): void {
  sharedClient = null;
  warnedDirectClient = false;
}

function useMultiAgentGateway(): boolean {
  if (!Features.llm.useGateway) return false;
  const raw = String(process.env.MULTIAGENT_USE_GATEWAY ?? '').trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off') return false;
  return true;
}

function resolveGatewayProvider(agentProvider: string): string {
  const fromEnv = String(process.env.MULTIAGENT_PROVIDER || '').trim().toLowerCase();
  if (fromEnv) return fromEnv;
  const fromAgent = String(agentProvider || '').trim().toLowerCase();
  if (fromAgent) return fromAgent;
  return Features.multiAgent.provider || 'deepseek';
}

function toGatewayMessages(messages: ChatMessage[]): LLMChatMessage[] {
  const out: LLMChatMessage[] = [];
  for (const msg of messages) {
    const role = msg.role;
    if (role === 'system' || role === 'user' || role === 'assistant' || role === 'tool') {
      const content =
        typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .map((part) => {
                  if (typeof part === 'string') return part;
                  if (part && typeof part === 'object' && 'text' in part) {
                    return String((part as { text?: string }).text ?? '');
                  }
                  return '';
                })
                .join('')
            : '';
      const entry: LLMChatMessage = { role, content };
      if (role === 'tool' && 'tool_call_id' in msg && msg.tool_call_id) {
        entry.tool_call_id = String(msg.tool_call_id);
      }
      if (role === 'assistant' && 'tool_calls' in msg && Array.isArray(msg.tool_calls)) {
        entry.tool_calls = msg.tool_calls
          .filter((tc) => tc && typeof tc === 'object' && 'function' in tc)
          .map((tc) => {
            const fn = (tc as { id?: string; function?: { name?: string; arguments?: string } })
              .function;
            let parameters: Record<string, unknown> = {};
            try {
              parameters = JSON.parse(fn?.arguments || '{}');
            } catch {
              parameters = {};
            }
            return {
              id: String((tc as { id?: string }).id || `tool_${Date.now()}`),
              name: String(fn?.name || 'unknown'),
              parameters,
            };
          });
      }
      out.push(entry);
    }
  }
  return out;
}

function toGatewayTools(
  tools: OpenAI.Chat.Completions.ChatCompletionTool[],
): LLMToolDefinition[] {
  return tools
    .filter((t) => t.type === 'function')
    .map((t) => ({
      name: t.function.name,
      description: t.function.description || '',
      parameters: (t.function.parameters as Record<string, unknown>) ?? {
        type: 'object',
        properties: {},
      },
    }));
}

function toChatCompletion(result: LLMResult, model: string): OpenAI.Chat.Completions.ChatCompletion {
  const toolCalls = result.tool_calls?.length
    ? result.tool_calls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.parameters ?? {}),
        },
      }))
    : undefined;

  return {
    id: `ma-gateway-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: result.model || model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: result.content || result.text || '',
          ...(toolCalls ? { tool_calls: toolCalls } : {}),
          refusal: null,
        },
        finish_reason: toolCalls?.length ? 'tool_calls' : 'stop',
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: result.inputTokens ?? 0,
      completion_tokens: result.outputTokens ?? 0,
      total_tokens: (result.inputTokens ?? 0) + (result.outputTokens ?? 0),
    },
  } as OpenAI.Chat.Completions.ChatCompletion;
}

export abstract class BaseAgent {
  protected readonly agentType: AgentType;
  protected readonly agentName: string;
  protected readonly model: string;
  protected readonly provider: string;
  protected readonly thinkingConfig: ThinkingConfig;
  protected readonly maxTokens: number;
  protected readonly temperature: number;
  protected client: OpenAI;

  constructor(agentType: AgentType, config: AgentConfig) {
    this.agentType = agentType;
    this.agentName = agentType;
    this.model = config.model;
    this.provider = config.provider;
    this.maxTokens = config.maxTokens ?? 4096;
    this.temperature = config.temperature ?? 0.7;
    this.thinkingConfig = config.thinking ?? {
      type: 'enabled',
      reasoningEffort: 'medium' as ThinkingConfig['reasoningEffort'],
    };
    // Lazy: only construct SDK client when gateway is off (rollback path).
    this.client = useMultiAgentGateway()
      ? (null as unknown as OpenAI)
      : getSharedClient();
  }

  protected getSystemPrompt(): string {
    return `You are a ${this.agentName} agent for Cardbey Performer, a mission-based store setup platform.`;
  }

  protected buildRequestBody(
    messages: ChatMessage[],
    options: DeepSeekCallOptions,
    tools?: OpenAI.Chat.Completions.ChatCompletionTool[],
  ): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
    const body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
      thinking?: { type: string; reasoning_effort: string };
    } = {
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    };

    if (options.responseFormat) {
      body.response_format = options.responseFormat;
    }

    if (tools?.length) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    if (this.thinkingConfig.type === 'enabled') {
      body.thinking = {
        type: this.thinkingConfig.type,
        reasoning_effort: this.thinkingConfig.reasoningEffort,
      };
    }

    return body;
  }

  private async callViaGateway(
    messages: ChatMessage[],
    options: DeepSeekCallOptions,
    tools?: OpenAI.Chat.Completions.ChatCompletionTool[],
  ): Promise<{ response: OpenAI.Chat.Completions.ChatCompletion; meta: DeepSeekCallMeta }> {
    const startTime = Date.now();
    const provider = resolveGatewayProvider(this.provider);
    const gatewayMessages = toGatewayMessages(messages);
    const gatewayTools = tools?.length ? toGatewayTools(tools) : undefined;

    const result = await llmGateway.complete({
      purpose: `multi_agent_${this.agentName}`,
      tenantKey: 'multi-agent',
      messages: gatewayMessages,
      provider,
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      responseFormat: options.responseFormat?.type === 'json_object' ? 'json' : 'text',
      thinking: this.thinkingConfig.type === 'enabled',
      ...(gatewayTools ? { tools: gatewayTools, tool_choice: 'auto' as const } : {}),
    });

    const response = toChatCompletion(result, this.model);
    const durationMs = Date.now() - startTime;
    const tokensUsed = (result.inputTokens ?? 0) + (result.outputTokens ?? 0);

    logger.info({
      message: `[${this.agentName}] gateway API call completed`,
      agent: this.agentName,
      model: result.model || this.model,
      provider,
      durationMs,
      tokens: tokensUsed,
      via: 'llmGateway',
    });

    return {
      response,
      meta: {
        tokensUsed,
        durationMs,
        model: result.model || this.model,
        provider,
      },
    };
  }

  /** Native tool-calling request (gateway by default). */
  protected async callDeepSeekWithTools(
    messages: ChatMessage[],
    tools: OpenAI.Chat.Completions.ChatCompletionTool[],
    options: DeepSeekCallOptions = {},
  ): Promise<{ response: OpenAI.Chat.Completions.ChatCompletion; meta: DeepSeekCallMeta }> {
    if (useMultiAgentGateway()) {
      return this.callViaGateway(messages, options, tools);
    }

    warnDirectDeepSeekClient('BaseAgent.callDeepSeekWithTools');
    if (!this.client) this.client = getSharedClient();

    const startTime = Date.now();
    const execute = async (): Promise<OpenAI.Chat.Completions.ChatCompletion> => {
      const body = this.buildRequestBody(messages, options, tools);
      return this.client.chat.completions.create(body);
    };

    const response = await retryWithBackoff(execute);
    return {
      response,
      meta: {
        tokensUsed: response.usage?.total_tokens ?? 0,
        durationMs: Date.now() - startTime,
        model: this.model,
        provider: this.provider,
      },
    };
  }

  protected async callDeepSeek(
    messages: ChatMessage[],
    options: DeepSeekCallOptions = {},
  ): Promise<{ response: OpenAI.Chat.Completions.ChatCompletion; meta: DeepSeekCallMeta }> {
    const startTime = Date.now();
    const cacheInput = options.cacheKey ?? JSON.stringify({ messages, model: this.model });

    if (options.useCache !== false) {
      const cached = globalRequestCache.get<OpenAI.Chat.Completions.ChatCompletion>(
        this.agentName,
        cacheInput,
      );
      if (cached) {
        return {
          response: cached,
          meta: {
            tokensUsed: cached.usage?.total_tokens ?? 0,
            durationMs: Date.now() - startTime,
            model: this.model,
            provider: this.provider,
          },
        };
      }
    }

    if (useMultiAgentGateway()) {
      try {
        const out = await this.callViaGateway(messages, options);
        if (options.useCache !== false) {
          globalRequestCache.set(this.agentName, cacheInput, out.response);
        }
        return out;
      } catch (primaryError) {
        return this.callFallback(messages, options, primaryError, startTime);
      }
    }

    warnDirectDeepSeekClient('BaseAgent.callDeepSeek');
    if (!this.client) this.client = getSharedClient();

    const execute = async (): Promise<OpenAI.Chat.Completions.ChatCompletion> => {
      const body = this.buildRequestBody(messages, options);
      return this.client.chat.completions.create(body);
    };

    try {
      const response = await retryWithBackoff(execute, {
        onRetry: (attempt, error) => {
          logger.warn({
            message: `[${this.agentName}] retrying API call`,
            agent: this.agentName,
            attempt,
            error: error.message,
          });
        },
      });

      const durationMs = Date.now() - startTime;
      const tokensUsed = response.usage?.total_tokens ?? 0;

      logger.info({
        message: `[${this.agentName}] API call completed`,
        agent: this.agentName,
        model: this.model,
        provider: this.provider,
        durationMs,
        tokens: tokensUsed,
        reasoningEffort: this.thinkingConfig.reasoningEffort,
        thinkingMode: this.thinkingConfig.type,
      });

      if (options.useCache !== false) {
        globalRequestCache.set(this.agentName, cacheInput, response);
      }

      return {
        response,
        meta: { tokensUsed, durationMs, model: this.model, provider: this.provider },
      };
    } catch (primaryError) {
      return this.callFallback(messages, options, primaryError, startTime);
    }
  }

  private async callFallback(
    messages: ChatMessage[],
    options: DeepSeekCallOptions,
    primaryError: unknown,
    startTime: number,
  ): Promise<{ response: OpenAI.Chat.Completions.ChatCompletion; meta: DeepSeekCallMeta }> {
    const err = primaryError instanceof Error ? primaryError : new Error(String(primaryError));

    logger.warn({
      message: `[${this.agentName}] primary provider failed, attempting fallback`,
      agent: this.agentName,
      error: err.message,
      stack: err.stack,
    });

    const fallbackProvider =
      String(process.env.MULTIAGENT_FALLBACK_PROVIDER || '').trim().toLowerCase() ||
      Features.multiAgent.fallbackProvider ||
      Features.llm.fallbackProvider ||
      'openai';

    if (useMultiAgentGateway() && Features.llm.available) {
      try {
        const result = await llmGateway.complete({
          purpose: `multi_agent_${this.agentName}_fallback`,
          tenantKey: 'multi-agent',
          messages: toGatewayMessages(messages),
          provider: fallbackProvider,
          maxTokens: this.maxTokens,
          temperature: this.temperature,
          responseFormat: options.responseFormat?.type === 'json_object' ? 'json' : 'text',
        });
        const response = toChatCompletion(result, result.model || fallbackProvider);
        return {
          response,
          meta: {
            tokensUsed: (result.inputTokens ?? 0) + (result.outputTokens ?? 0),
            durationMs: Date.now() - startTime,
            model: result.model || fallbackProvider,
            provider: `${fallbackProvider}-fallback`,
          },
        };
      } catch {
        // fall through to OpenAI SDK fallback
      }
    }

    const fallback = loadFallbackConfig();
    if (!fallback.openaiApiKey) {
      throw err;
    }

    warnDirectDeepSeekClient('BaseAgent.callFallback');
    const fallbackClient = new OpenAI({
      apiKey: fallback.openaiApiKey,
      timeout: loadDeepSeekConfig().timeoutMs,
    });

    const response = await retryWithBackoff(() =>
      fallbackClient.chat.completions.create({
        model: fallback.openaiModel,
        messages,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
      }),
    );

    const durationMs = Date.now() - startTime;
    const tokensUsed = response.usage?.total_tokens ?? 0;

    logger.info({
      message: `[${this.agentName}] fallback API call completed`,
      agent: this.agentName,
      model: fallback.openaiModel,
      provider: 'openai',
      durationMs,
      tokens: tokensUsed,
    });

    return {
      response,
      meta: {
        tokensUsed,
        durationMs,
        model: fallback.openaiModel,
        provider: 'openai-fallback',
      },
    };
  }

  protected extractContent(response: OpenAI.Chat.Completions.ChatCompletion): string {
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`[${this.agentName}] empty response content`);
    }
    return content;
  }

  protected async executeWithTrace<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await operation();
      logger.debug({
        message: `[${this.agentName}] ${operationName} completed`,
        agent: this.agentName,
        durationMs: Date.now() - startTime,
        success: true,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({
        message: `[${this.agentName}] ${operationName} failed`,
        agent: this.agentName,
        durationMs: Date.now() - startTime,
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  abstract process(input: unknown): Promise<unknown>;
}
