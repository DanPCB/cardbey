/**
 * Anthropic vision — wraps postAnthropicMessages (Phase 3).
 */

import { postAnthropicMessages } from '../anthropicProvider.js';
import { resolveAnthropicModel } from '../anthropicModelConfig.js';
import { normalizeVisionImage } from '../normalizeVisionImage.js';
import type { VisionRequest, VisionResponse } from '../multimodalTypes.js';

export async function anthropicVision(request: VisionRequest): Promise<VisionResponse> {
  const media = normalizeVisionImage(request.image, request.mediaType);
  const model = resolveAnthropicModel(request.model);
  const maxTokens = request.maxTokens ?? 1024;

  const userContent: Array<Record<string, unknown>> = [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: media.mediaType,
        data: media.base64,
      },
    },
    { type: 'text', text: request.prompt },
  ];

  const messages: Array<Record<string, unknown>> = [
    { role: 'user', content: userContent },
  ];

  // Anthropic uses top-level system; fold into prompt prefix if provided
  let payloadMessages = messages;
  let system: string | undefined;
  if (request.system?.trim()) {
    system = request.system.trim();
  }

  const raw = (await postAnthropicMessages({
    model,
    max_tokens: maxTokens,
    messages: payloadMessages,
    ...(system ? { system } : {}),
  })) as {
    content?: Array<{ type?: string; text?: string }>;
    error?: string;
    model?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  if (raw?.error) {
    throw new Error(`Anthropic vision error: ${raw.error}`);
  }

  const content =
    raw?.content && Array.isArray(raw.content)
      ? raw.content.map((c) => c?.text ?? '').join('').trim()
      : '';

  return {
    content,
    provider: 'anthropic',
    model: raw.model || model,
    usage: {
      promptTokens: raw.usage?.input_tokens ?? 0,
      completionTokens: raw.usage?.output_tokens ?? 0,
    },
    raw,
  };
}
