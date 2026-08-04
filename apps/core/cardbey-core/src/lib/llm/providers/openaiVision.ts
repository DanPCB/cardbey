/**
 * OpenAI vision — chat completions with image_url (Phase 3).
 */

import OpenAI from 'openai';
import { normalizeVisionImage } from '../normalizeVisionImage.js';
import type { VisionRequest, VisionResponse } from '../multimodalTypes.js';

export async function openaiVision(request: VisionRequest): Promise<VisionResponse> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const media = normalizeVisionImage(request.image, request.mediaType);
  const model =
    request.model?.trim() ||
    process.env.OPENAI_VISION_MODEL?.trim() ||
    'gpt-4o';
  const maxTokens = request.maxTokens ?? 1024;
  const detail = request.detail ?? 'high';

  const openai = new OpenAI({ apiKey, timeout: 60000, maxRetries: 2 });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (request.system?.trim()) {
    messages.push({ role: 'system', content: request.system.trim() });
  }
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: request.prompt },
      {
        type: 'image_url',
        image_url: { url: media.dataUrl, detail },
      },
    ],
  });

  const completion = await openai.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.1,
  });

  const content = completion.choices[0]?.message?.content?.trim() || '';

  return {
    content,
    provider: 'openai',
    model: completion.model || model,
    usage: {
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
    },
    raw: completion,
  };
}
