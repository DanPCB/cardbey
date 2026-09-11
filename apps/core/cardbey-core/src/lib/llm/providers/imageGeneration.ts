/**
 * Image generation providers for llmGateway (Phase 3).
 * Wraps OpenAI Images + existing Ideogram/Recraft logo generators.
 */

import OpenAI from 'openai';
import type { ImageGenerationRequest, ImageGenerationResponse } from '../multimodalTypes.js';

export async function dalleGeneration(
  request: ImageGenerationRequest,
): Promise<ImageGenerationResponse> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const model = request.model?.trim() || process.env.OPENAI_IMAGE_MODEL?.trim() || 'dall-e-3';
  const size = (request.size || '1024x1024') as '1024x1024' | '1792x1024' | '1024x1792';
  const openai = new OpenAI({ apiKey, timeout: 120000, maxRetries: 1 });

  const result = await openai.images.generate({
    model,
    prompt: request.prompt,
    n: Math.min(Math.max(request.count ?? 1, 1), model.includes('dall-e-3') ? 1 : 4),
    size,
    ...(request.style && model.includes('dall-e-3')
      ? { style: request.style as 'vivid' | 'natural' }
      : {}),
  });

  const images = (result.data ?? [])
  .map((d) => {
    if (typeof d?.url === 'string' && d.url.trim()) {
      return d.url.trim();
    }

    if (typeof d?.b64_json === 'string' && d.b64_json.trim()) {
      return `data:image/png;base64,${d.b64_json.trim()}`;
    }

    return '';
  })
  .filter(Boolean);

console.log('[dalleGeneration] response shape', {
  model,
  dataCount: Array.isArray(result?.data) ? result.data.length : 0,
  imageCount: images.length,
  firstImageType:
    images[0]?.startsWith('data:image/')
      ? 'base64-data-url'
      : images[0]?.startsWith('http')
        ? 'url'
        : images[0]
          ? 'unknown'
          : 'none',
});

if (images.length === 0) {
  const err = new Error('OpenAI image generation returned no usable image payload');
  (err as Error & { code?: string }).code = 'OPENAI_IMAGE_EMPTY_RESPONSE';
  throw err;
}

  return {
    images,
    provider: 'dalle',
    model,
    raw: result,
  };
}

export async function ideogramGeneration(
  request: ImageGenerationRequest,
): Promise<ImageGenerationResponse> {
  const { generate, isConfigured } = await import('../../../services/logo/IdeogramGenerator.js');
  if (!isConfigured()) {
    throw new Error('IDEOGRAM_API_KEY is not set');
  }

  const meta = request.meta ?? {};
  const result = await generate({
    storeName: String(meta.storeName ?? ''),
    industry: String(meta.industry ?? ''),
    style: String(request.style ?? meta.style ?? ''),
    colors: String(meta.colors ?? ''),
    description: request.prompt || String(meta.description ?? ''),
  });

  const url = result?.image_url || result?.imageUrl || result?.url || '';
  return {
    images: url ? [url] : [],
    provider: 'ideogram',
    model: request.model || 'V_2',
    raw: result,
  };
}

export async function recraftGeneration(
  request: ImageGenerationRequest,
): Promise<ImageGenerationResponse> {
  const { generate, isConfigured } = await import('../../../services/logo/RecraftGenerator.js');
  if (!isConfigured()) {
    throw new Error('RECRAFT_API_KEY is not set');
  }

  const meta = request.meta ?? {};
  const result = await generate({
    storeName: String(meta.storeName ?? ''),
    industry: String(meta.industry ?? ''),
    style: String(request.style ?? meta.style ?? ''),
    colors: String(meta.colors ?? ''),
    description: request.prompt || String(meta.description ?? ''),
  });

  const url = result?.image_url || result?.imageUrl || result?.url || '';
  return {
    images: url ? [url] : [],
    provider: 'recraft',
    model: request.model || 'recraft',
    raw: result,
  };
}
