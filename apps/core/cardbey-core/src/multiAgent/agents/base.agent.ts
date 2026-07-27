/**
 * Base agent class — DeepSeek API client, thinking mode, retries, fallback.
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

function getSharedClient(): OpenAI {
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
    this.client = getSharedClient();
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

  /** Native tool-calling DeepSeek request. */
  protected async callDeepSeekWithTools(
    messages: ChatMessage[],
    tools: OpenAI.Chat.Completions.ChatCompletionTool[],
    options: DeepSeekCallOptions = {},
  ): Promise<{ response: OpenAI.Chat.Completions.ChatCompletion; meta: DeepSeekCallMeta }> {
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
    const fallback = loadFallbackConfig();
    const err = primaryError instanceof Error ? primaryError : new Error(String(primaryError));

    logger.warn({
      message: `[${this.agentName}] primary provider failed, attempting fallback`,
      agent: this.agentName,
      error: err.message,
      stack: err.stack,
    });

    if (!fallback.openaiApiKey) {
      throw err;
    }

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
