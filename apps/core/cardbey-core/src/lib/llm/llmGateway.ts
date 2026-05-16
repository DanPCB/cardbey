/**
 * LLM Gateway — single entry for LLM calls with cache, usage tracking, and daily cap.
 * Uses LlmCache and LlmUsageDaily from Prisma schema.
 */

import crypto from 'node:crypto';
import OpenAI from 'openai';
import { getPrismaClient } from '../../lib/prisma.js';
import { anthropicProvider, postAnthropicMessages } from './anthropicProvider.js';

export type LLMGatewayOptions = {
  purpose: string;
  prompt: string;
  model?: string;
  provider?: string;
  maxTokens?: number;
  tenantKey: string;
  responseFormat?: 'text' | 'json';
  temperature?: number;
};

export type LLMResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cached: boolean;
};

const OPENAI_PROVIDER = 'openai';
/** Prefer env; default `gpt-4o` — some OpenAI-compatible gateways omit `gpt-4o-mini`. */
const DEFAULT_MODEL =
  process.env.OPENAI_CHAT_MODEL?.trim() || 'gpt-4o';
/** When the primary model returns 404 / "model not found", try these (deduped). */
const OPENAI_MODEL_FALLBACKS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
/** Anthropic default must be a Claude id — never reuse OpenAI DEFAULT_MODEL for this provider. */
const DEFAULT_ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL?.trim() || 'claude-3-5-sonnet-20240620';
const DEFAULT_MAX_TOKENS = 1000;
const DEFAULT_TEMPERATURE = 0.3;
const CACHE_TTL_DAYS = 7;

function resolveModel(
  providerName: string,
  explicit?: string
): string {
  const trimmed =
    typeof explicit === 'string' && explicit.trim() ? explicit.trim() : '';
  if (trimmed) {
    if (providerName === 'anthropic' && /^gpt-/i.test(trimmed)) {
      console.warn(
        '[llmGateway] OpenAI-style model with anthropic provider; using DEFAULT_ANTHROPIC_MODEL'
      );
      return DEFAULT_ANTHROPIC_MODEL;
    }
    return trimmed;
  }
  return providerName === 'anthropic'
    ? DEFAULT_ANTHROPIC_MODEL
    : DEFAULT_MODEL;
}

const DEFAULT_PROVIDER_ENV = process.env.LLM_DEFAULT_PROVIDER;
const DEFAULT_PROVIDER =
  DEFAULT_PROVIDER_ENV ??
  (process.env.ANTHROPIC_API_KEY ? 'anthropic' : OPENAI_PROVIDER);

function getTodayUtc(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function hashPrompt(prompt: string): string {
  return crypto.createHash('sha256').update(prompt, 'utf8').digest('hex');
}

function isOpenAiModelNotFoundError(err: unknown): boolean {
  const e = err as {
    status?: number;
    message?: string;
    error?: { message?: string; code?: string };
  };
  const blob = `${e?.message ?? ''} ${e?.error?.message ?? ''} ${e?.error?.code ?? ''}`.toLowerCase();
  return (
    e?.status === 404 ||
    /model not found|does not exist|invalid_model|unknown model|model_not_found/i.test(blob)
  );
}

/**
 * OpenAI Chat Completions with best-effort model fallback (compat proxies / account SKUs).
 */
async function openaiChatCompletionsWithFallback(
  openai: OpenAI,
  primaryModel: string,
  bodyBase: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, 'model'>
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const candidates = [primaryModel, ...OPENAI_MODEL_FALLBACKS].filter(
    (m, i, a) => m && a.indexOf(m) === i
  );
  let lastErr: unknown;
  for (const tryModel of candidates) {
    const body = { ...bodyBase, model: tryModel } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
    try {
      const completion = (await openai.chat.completions.create(
        body
      )) as OpenAI.Chat.Completions.ChatCompletion;
      if (tryModel !== primaryModel && process.env.NODE_ENV !== 'production') {
        console.warn(
          `[llmGateway] OpenAI model "${primaryModel}" unavailable; succeeded with "${tryModel}"`
        );
      }
      return completion;
    } catch (err) {
      lastErr = err;
      if (!isOpenAiModelNotFoundError(err)) throw err;
    }
  }
  throw lastErr;
}

async function generate(options: LLMGatewayOptions): Promise<LLMResult> {
  const {
    purpose,
    prompt,
    model: modelOption,
    provider,
    maxTokens = DEFAULT_MAX_TOKENS,
    tenantKey,
    responseFormat = 'text',
    temperature = DEFAULT_TEMPERATURE,
  } = options;
  const providerName = provider ?? DEFAULT_PROVIDER;
  const model = resolveModel(providerName, modelOption);

  if (process.env.LLM_ENABLED === 'false') {
    return { text: '', inputTokens: 0, outputTokens: 0, cached: false };
  }

  const prisma = getPrismaClient();
  const promptHash = hashPrompt(prompt);
  const day = getTodayUtc();

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
    await prisma.llmCache.update({
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
    }).catch(() => {});
    return {
      text: cacheRecord.response,
      inputTokens: 0,
      outputTokens: 0,
      cached: true,
    };
  }

  let text = '';
  let inputTokens = 0;
  let outputTokens = 0;

  if (providerName === 'anthropic') {
    const result = await anthropicProvider.generateText(prompt, {
      maxTokens,
      model,
    });
    text = result.text ?? '';
    inputTokens = result.tokensIn ?? 0;
    outputTokens = result.tokensOut ?? 0;
  } else if (providerName === 'xai') {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      console.warn('[llmGateway] XAI_API_KEY not set, returning empty');
      return { text: '', inputTokens: 0, outputTokens: 0, cached: false };
    }
    const xai = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1' });
    const body: Parameters<OpenAI['chat']['completions']['create']>[0] = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    };
    if (responseFormat === 'json') {
      (body as unknown as Record<string, unknown>).response_format = {
        type: 'json_object',
      };
    }
    const completion = (await xai.chat.completions.create(
      body
    )) as OpenAI.Chat.Completions.ChatCompletion;
    text = completion.choices[0]?.message?.content ?? '';
    inputTokens = completion.usage?.prompt_tokens ?? 0;
    outputTokens = completion.usage?.completion_tokens ?? 0;
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { text: '', inputTokens: 0, outputTokens: 0, cached: false };
    }

    const openai = new OpenAI({ apiKey });
    const completion = (await openaiChatCompletionsWithFallback(openai, model, {
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }],
      ...(responseFormat === 'json'
        ? { response_format: { type: 'json_object' as const } }
        : {}),
    })) as OpenAI.Chat.Completions.ChatCompletion;
    text = completion.choices[0]?.message?.content ?? '';
    inputTokens = completion.usage?.prompt_tokens ?? 0;
    outputTokens = completion.usage?.completion_tokens ?? 0;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + CACHE_TTL_DAYS);

  await Promise.all([
    prisma.llmCache.upsert({
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
        response: text,
        expiresAt,
      },
      update: {
        response: text,
        expiresAt,
        lastAccessedAt: new Date(),
      },
    }),
    prisma.llmUsageDaily.upsert({
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
        tokensIn: inputTokens,
        tokensOut: outputTokens,
      },
      update: {
        calls: { increment: 1 },
        tokensIn: { increment: inputTokens },
        tokensOut: { increment: outputTokens },
      },
    }),
  ]);

  return {
    text,
    inputTokens,
    outputTokens,
    cached: false,
  };
}

const VISION_ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL?.trim() || 'claude-3-5-sonnet-20240620';

/**
 * Anthropic Messages API with multimodal content (vision). No prompt cache.
 */
export async function completeAnthropicVisionMessages(opts: {
  messages: Array<Record<string, unknown>>;
  maxTokens?: number;
  model?: string;
}): Promise<{
  content?: Array<{ type?: string; text?: string }>;
  error?: string;
  text?: string;
}> {
  const model = opts.model?.trim() || VISION_ANTHROPIC_MODEL;
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

export const llmGateway = { generate, completeAnthropicVisionMessages };
