/**
 * LLM Gateway — multi-message chat + native tool calling with cache and usage tracking.
 * Phase 1: kimi + groq providers; PII redaction before provider calls.
 */

import crypto from 'node:crypto';
import { getPrismaClient } from '../../lib/prisma.js';
import { redactChatMessages } from '../privacy/redactionMiddleware.ts';
import { resolveAnthropicModel } from './anthropicModelConfig.js';
import { buildChatMessages, capChatMessages, hashChatPayload } from './llmMessageBuilder.js';
import { callAnthropicChat } from './providers/anthropicChat.js';
import { callDeepSeekChat } from './providers/deepseekChat.js';
import { callGroqChat, resolveGroqModel } from './providers/groqChat.js';
import { callKimiChat, resolveKimiModel } from './providers/kimiChat.js';
import { callOpenAIChat, callXaiChat } from './providers/openaiChat.js';
import {
  analyzeVision,
  embed,
  generateImage,
  generateVideo,
} from './multimodalGateway.js';
import type {
  LLMGatewayOptions,
  LLMProviderChatRequest,
  LLMProviderChatResponse,
  LLMResult,
} from './llmGatewayTypes.js';

export type { LLMGatewayOptions, LLMResult, LLMChatMessage, LLMToolDefinition, LLMToolCall } from './llmGatewayTypes.js';
export type {
  VisionRequest,
  VisionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  VideoGenerationRequest,
  VideoGenerationResponse,
} from './multimodalTypes.js';
export { analyzeVision, embed, generateImage, generateVideo };

const OPENAI_PROVIDER = 'openai';
const DEFAULT_MODEL =
  process.env.OPENAI_CHAT_MODEL?.trim() || 'gpt-4o';
const DEFAULT_ANTHROPIC_MODEL = resolveAnthropicModel();
const DEFAULT_MAX_TOKENS = 1000;
const DEFAULT_TEMPERATURE = 0.3;
const CACHE_TTL_DAYS = 7;

/** Phase 1 provider registry — Anthropic → Kimi/Groq via config / x-provider. */
export const PROVIDER_NAMES = [
  'anthropic',
  'openai',
  'deepseek',
  'xai',
  'kimi',
  'groq',
] as const;

export type GatewayProviderName = (typeof PROVIDER_NAMES)[number];

const DEFAULT_PROVIDER_ENV = process.env.LLM_DEFAULT_PROVIDER;
const DEFAULT_PROVIDER =
  DEFAULT_PROVIDER_ENV ??
  (process.env.ANTHROPIC_API_KEY ? 'anthropic' : OPENAI_PROVIDER);

export function validateProvider(provider: string): asserts provider is GatewayProviderName {
  if (!(PROVIDER_NAMES as readonly string[]).includes(provider)) {
    throw new Error(
      `Unsupported provider: ${provider}. Supported: ${PROVIDER_NAMES.join(', ')}`,
    );
  }
}

function resolveModel(providerName: string, explicit?: string): string {
  const trimmed =
    typeof explicit === 'string' && explicit.trim() ? explicit.trim() : '';
  if (providerName === 'kimi') {
    return resolveKimiModel(trimmed || undefined);
  }
  if (providerName === 'groq') {
    return resolveGroqModel(trimmed || undefined);
  }
  if (trimmed) {
    if (providerName === 'anthropic' && /^gpt-/i.test(trimmed)) {
      console.warn(
        '[llmGateway] OpenAI-style model with anthropic provider; using DEFAULT_ANTHROPIC_MODEL',
      );
      return DEFAULT_ANTHROPIC_MODEL;
    }
    return providerName === 'anthropic' ? resolveAnthropicModel(trimmed) : trimmed;
  }
  return providerName === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_MODEL;
}

function selectProvider(explicit?: string, model?: string): string {
  if (explicit?.trim()) {
    const name = explicit.trim().toLowerCase();
    validateProvider(name);
    return name;
  }
  if (model?.startsWith('claude')) return 'anthropic';
  if (model?.startsWith('gpt')) return OPENAI_PROVIDER;
  if (model?.startsWith('deepseek')) return 'deepseek';
  if (model?.startsWith('kimi') || model?.startsWith('moonshot')) return 'kimi';
  if (model?.startsWith('llama') || model?.startsWith('mixtral') || model?.startsWith('groq')) {
    return 'groq';
  }
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return OPENAI_PROVIDER;
  if (process.env.KIMI_API_KEY) return 'kimi';
  if (process.env.GROQ_API_KEY) return 'groq';
  return DEFAULT_PROVIDER;
}

function getFallbackProvider(primary: string): string | null {
  const configured = String(process.env.LLM_FALLBACK_PROVIDER ?? '').trim().toLowerCase();
  if (configured && configured !== primary) {
    if ((PROVIDER_NAMES as readonly string[]).includes(configured)) return configured;
  }
  if (primary === 'anthropic' && process.env.OPENAI_API_KEY) return OPENAI_PROVIDER;
  if (primary === OPENAI_PROVIDER && process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if ((primary === 'kimi' || primary === 'groq') && process.env.OPENAI_API_KEY) {
    return OPENAI_PROVIDER;
  }
  if ((primary === 'kimi' || primary === 'groq') && process.env.ANTHROPIC_API_KEY) {
    return 'anthropic';
  }
  return null;
}

function toolCallingEnabled(): boolean {
  return String(process.env.LLM_TOOL_CALLING_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
}

function maxMessagesLimit(): number {
  const n = parseInt(process.env.LLM_MAX_MESSAGES || '50', 10);
  return Number.isFinite(n) && n > 0 ? n : 50;
}

function getTodayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function hashPrompt(prompt: string): string {
  return crypto.createHash('sha256').update(prompt, 'utf8').digest('hex');
}

async function callProviderChat(
  providerName: string,
  request: LLMProviderChatRequest,
): Promise<LLMProviderChatResponse> {
  validateProvider(providerName);
  switch (providerName) {
    case 'anthropic':
      return callAnthropicChat(request);
    case 'deepseek':
      return callDeepSeekChat(request);
    case 'xai':
      return callXaiChat(request);
    case 'kimi':
      return callKimiChat(request);
    case 'groq':
      return callGroqChat(request);
    case 'openai':
    default:
      return callOpenAIChat(request);
  }
}

async function invokeProviderWithFallback(
  providerName: string,
  request: LLMProviderChatRequest,
): Promise<LLMProviderChatResponse> {
  try {
    return await callProviderChat(providerName, request);
  } catch (error) {
    const fallback = getFallbackProvider(providerName);
    if (!fallback) throw error;
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[llmGateway] provider "${providerName}" failed; falling back to "${fallback}"`,
      );
    }
    return callProviderChat(fallback, request);
  }
}

function toGatewayResult(response: LLMProviderChatResponse, cached = false): LLMResult {
  return {
    text: response.content,
    content: response.content,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    cached,
    ...(response.thinkingText ? { thinkingText: response.thinkingText } : {}),
    tool_calls: response.tool_calls ?? null,
    ...(response.model ? { model: response.model } : {}),
    ...(response.stopReason ? { stopReason: response.stopReason } : {}),
    ...(response.finishReason ? { finishReason: response.finishReason } : {}),
  };
}

/**
 * Full multi-message + tool calling entry point.
 */
export async function complete(options: LLMGatewayOptions): Promise<LLMResult> {
  const {
    purpose,
    tenantKey,
    messages: messagesOption,
    prompt,
    system,
    systemPrompt,
    tools = [],
    tool_choice = 'auto',
    tool_results = [],
    autoContinueAfterToolResults = false,
    model: modelOption,
    provider,
    maxTokens = DEFAULT_MAX_TOKENS,
    temperature = DEFAULT_TEMPERATURE,
    responseFormat = 'text',
    thinking = false,
    thinkingBudget,
    timeoutMs,
  } = options;

  const providerName = selectProvider(provider, modelOption);
  const model = resolveModel(providerName, modelOption);

  if (process.env.LLM_ENABLED === 'false') {
    return {
      text: '',
      content: '',
      inputTokens: 0,
      outputTokens: 0,
      cached: false,
      tool_calls: null,
    };
  }

  let builtMessages = buildChatMessages({
    messages: messagesOption,
    system: system ?? systemPrompt,
    systemPrompt,
    prompt,
    tool_results,
  });
  builtMessages = capChatMessages(builtMessages, maxMessagesLimit());
  // Phase 1: strip PII before cache key + external provider (ENABLE_PII_REDACTION=false to skip)
  builtMessages = redactChatMessages(builtMessages, purpose);

  const effectiveTools = toolCallingEnabled() && tools.length > 0 ? tools : undefined;

  const prisma = getPrismaClient();
  const promptHash = hashPrompt(hashChatPayload(builtMessages, effectiveTools));
  const day = getTodayUtc();
  const skipCache = thinking === true || Boolean(effectiveTools?.length);

  const dailyCap =
    Math.max(0, parseInt(process.env.LLM_DAILY_CAP ?? '100000', 10) || 100000);
  const usageRows = await prisma.llmUsageDaily.findMany({
    where: { tenantKey, day },
    select: { tokensIn: true, tokensOut: true },
  });
  const totalTokens = usageRows.reduce((sum, r) => sum + r.tokensIn + r.tokensOut, 0);
  if (totalTokens >= dailyCap) {
    throw new Error('LLM daily cap reached');
  }

  if (!skipCache) {
    const cacheRecord = await prisma.llmCache.findUnique({
      where: {
        LlmCache_key: {
          tenantKey,
          purpose,
          promptHash,
          provider: providerName,
          model,
        },
      },
      select: { response: true, expiresAt: true },
    });

    if (cacheRecord && cacheRecord.expiresAt > new Date()) {
      await prisma.llmCache
        .update({
          where: {
            LlmCache_key: {
              tenantKey,
              purpose,
              promptHash,
              provider: providerName,
              model,
            },
          },
          data: {
            lastAccessedAt: new Date(),
            hitCount: { increment: 1 },
          },
        })
        .catch(() => {});

      return {
        text: cacheRecord.response,
        content: cacheRecord.response,
        inputTokens: 0,
        outputTokens: 0,
        cached: true,
        tool_calls: null,
      };
    }
  }

  const chatRequest: LLMProviderChatRequest = {
    messages: builtMessages,
    tools: effectiveTools,
    tool_choice: effectiveTools ? tool_choice : undefined,
    maxTokens,
    temperature,
    model,
    thinking,
    thinkingBudget,
    responseFormat,
    timeoutMs,
    purpose,
  };

  let response = await invokeProviderWithFallback(providerName, chatRequest);

  if (
    autoContinueAfterToolResults &&
    tool_results.length > 0 &&
    response.tool_calls?.length
  ) {
    const assistantMessage = {
      role: 'assistant' as const,
      content: response.content,
      tool_calls: response.tool_calls,
    };
    const continuationMessages = [
      ...builtMessages,
      assistantMessage,
      ...tool_results.map((tr) => ({
        role: 'tool' as const,
        tool_call_id: tr.tool_call_id,
        content:
          typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result ?? null),
        ...(tr.name ? { name: tr.name } : {}),
      })),
    ];

    response = await invokeProviderWithFallback(providerName, {
      ...chatRequest,
      messages: capChatMessages(continuationMessages, maxMessagesLimit()),
    });
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + CACHE_TTL_DAYS);

  const cacheUpsert = skipCache
    ? Promise.resolve()
    : prisma.llmCache.upsert({
        where: {
          LlmCache_key: {
            tenantKey,
            purpose,
            promptHash,
            provider: providerName,
            model,
          },
        },
        create: {
          tenantKey,
          purpose,
          promptHash,
          provider: providerName,
          model,
          response: response.content,
          expiresAt,
        },
        update: {
          response: response.content,
          expiresAt,
          lastAccessedAt: new Date(),
        },
      });

  const usageUpsert = prisma.llmUsageDaily.upsert({
    where: {
      LlmUsageDaily_key: {
        tenantKey,
        purpose,
        provider: providerName,
        model,
        day,
      },
    },
    create: {
      tenantKey,
      purpose,
      provider: providerName,
      model,
      day,
      calls: 1,
      tokensIn: response.inputTokens,
      tokensOut: response.outputTokens,
    },
    update: {
      calls: { increment: 1 },
      tokensIn: { increment: response.inputTokens },
      tokensOut: { increment: response.outputTokens },
    },
  });

  const isSQLite = (process.env.DATABASE_URL ?? '').includes('.db');
  if (isSQLite) {
    try {
      await cacheUpsert;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn('[llmGateway] cache upsert failed:', message);
    }
    try {
      await usageUpsert;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn('[llmGateway] usage upsert failed:', message);
    }
  } else {
    await Promise.all([cacheUpsert, usageUpsert]);
  }

  return toGatewayResult(response, false);
}

/**
 * Backward-compatible generate() — accepts legacy prompt/systemPrompt or messages[].
 */
async function generate(options: LLMGatewayOptions): Promise<LLMResult> {
  return complete({
    ...options,
    system: options.system ?? options.systemPrompt,
    prompt: options.prompt,
  });
}

/** Anthropic Messages API with multimodal content (vision). No prompt cache. */
export async function completeAnthropicVisionMessages(opts: {
  messages: Array<Record<string, unknown>>;
  maxTokens?: number;
  model?: string;
}): Promise<{
  content?: Array<{ type?: string; text?: string }>;
  error?: string;
  text?: string;
}> {
  const { postAnthropicMessages } = await import('./anthropicProvider.js');
  const model = opts.model?.trim() || resolveAnthropicModel();
  const max_tokens = opts.maxTokens ?? 400;
  const raw = (await postAnthropicMessages({
    model,
    max_tokens,
    messages: opts.messages,
  })) as {
    content?: Array<{ type?: string; text?: string }>;
    error?: string;
  };
  if (raw?.error) {
    return { error: raw.error, text: undefined };
  }
  const text =
    raw?.content && Array.isArray(raw.content)
      ? raw.content.map((c) => c?.text ?? '').join('').trim() || undefined
      : undefined;
  return { ...raw, text };
}

export const llmGateway = {
  generate,
  complete,
  completeAnthropicVisionMessages,
  analyzeVision,
  embed,
  generateImage,
  generateVideo,
};
