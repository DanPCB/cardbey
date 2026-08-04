/**
 * Phase 3 — multimodal + embeddings facades for llmGateway.
 */

import { Features } from '../../config/features.js';
import { redactPII } from '../privacy/redactionMiddleware.ts';
import { anthropicVision } from './providers/anthropicVision.js';
import { openaiVision } from './providers/openaiVision.js';
import { openaiEmbedding } from './providers/openaiEmbedding.js';
import { voyageEmbedding } from './providers/voyageEmbedding.js';
import { cohereEmbedding } from './providers/cohereEmbedding.js';
import {
  dalleGeneration,
  ideogramGeneration,
  recraftGeneration,
} from './providers/imageGeneration.js';
import { klingVideoGeneration, openaiVideoGeneration } from './providers/videoGeneration.js';
import type {
  EmbeddingRequest,
  EmbeddingResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  VideoGenerationRequest,
  VideoGenerationResponse,
  VisionRequest,
  VisionResponse,
} from './multimodalTypes.js';

export type {
  EmbeddingRequest,
  EmbeddingResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  VideoGenerationRequest,
  VideoGenerationResponse,
  VisionRequest,
  VisionResponse,
} from './multimodalTypes.js';

type VisionFn = (req: VisionRequest) => Promise<VisionResponse>;
type EmbedFn = (req: EmbeddingRequest) => Promise<EmbeddingResponse>;
type ImageFn = (req: ImageGenerationRequest) => Promise<ImageGenerationResponse>;
type VideoFn = (req: VideoGenerationRequest) => Promise<VideoGenerationResponse>;

const VISION_PROVIDERS: Record<string, VisionFn> = {
  anthropic: anthropicVision,
  openai: openaiVision,
};

const EMBEDDING_PROVIDERS: Record<string, EmbedFn> = {
  openai: openaiEmbedding,
  voyage: voyageEmbedding,
  cohere: cohereEmbedding,
};

const IMAGE_PROVIDERS: Record<string, ImageFn> = {
  dalle: dalleGeneration,
  openai: dalleGeneration,
  ideogram: ideogramGeneration,
  recraft: recraftGeneration,
};

const VIDEO_PROVIDERS: Record<string, VideoFn> = {
  openai: openaiVideoGeneration,
  kling: klingVideoGeneration,
};

function redactPrompt(prompt: string): string {
  if (!Features.llm.piiRedaction) return prompt;
  const out = redactPII(prompt);
  return typeof out === 'string' ? out : prompt;
}

/**
 * Analyze an image with a vision-capable model (Anthropic / OpenAI).
 */
export async function analyzeVision(request: VisionRequest): Promise<VisionResponse> {
  if (!Features.vision.enabled) {
    const err = new Error('Vision is disabled (VISION_ENABLED=false)');
    (err as Error & { code?: string }).code = 'VISION_DISABLED';
    throw err;
  }

  const provider = (
    request.provider ||
    Features.vision.defaultProvider ||
    'anthropic'
  )
    .trim()
    .toLowerCase();

  const method = VISION_PROVIDERS[provider];
  if (!method) {
    throw new Error(
      `Vision not supported for provider: ${provider}. Supported: ${Object.keys(VISION_PROVIDERS).join(', ')}`,
    );
  }

  try {
    return await method({
      ...request,
      prompt: redactPrompt(request.prompt),
      system: request.system ? redactPrompt(request.system) : request.system,
    });
  } catch (primaryError) {
    const fallback = Features.vision.fallbackProvider;
    if (fallback && fallback !== provider && VISION_PROVIDERS[fallback]) {
      console.warn(
        `[llmGateway.analyzeVision] ${provider} failed; falling back to ${fallback}`,
      );
      return VISION_PROVIDERS[fallback]({
        ...request,
        provider: fallback,
        prompt: redactPrompt(request.prompt),
        system: request.system ? redactPrompt(request.system) : request.system,
      });
    }
    throw primaryError;
  }
}

/**
 * Generate embeddings (OpenAI / Voyage / Cohere).
 */
export async function embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
  if (!Features.embeddings.enabled) {
    const err = new Error('Embeddings are disabled (EMBEDDING_ENABLED=false)');
    (err as Error & { code?: string }).code = 'EMBEDDING_DISABLED';
    throw err;
  }

  const provider = (
    request.provider ||
    Features.embeddings.defaultProvider ||
    'openai'
  )
    .trim()
    .toLowerCase();

  const method = EMBEDDING_PROVIDERS[provider];
  if (!method) {
    throw new Error(
      `Embeddings not supported for provider: ${provider}. Supported: ${Object.keys(EMBEDDING_PROVIDERS).join(', ')}`,
    );
  }

  try {
    return await method(request);
  } catch (primaryError) {
    const fallback = Features.embeddings.fallbackProvider;
    if (fallback && fallback !== provider && EMBEDDING_PROVIDERS[fallback]) {
      console.warn(
        `[llmGateway.embed] ${provider} failed; falling back to ${fallback}`,
      );
      return EMBEDDING_PROVIDERS[fallback]({ ...request, provider: fallback });
    }
    throw primaryError;
  }
}

/**
 * Generate images (DALL·E / Ideogram / Recraft).
 */
export async function generateImage(
  request: ImageGenerationRequest,
): Promise<ImageGenerationResponse> {
  if (!Features.image.enabled) {
    const err = new Error('Image generation is disabled (IMAGE_GEN_ENABLED=false)');
    (err as Error & { code?: string }).code = 'IMAGE_GEN_DISABLED';
    throw err;
  }

  const provider = (request.provider || Features.image.defaultProvider || 'dalle')
    .trim()
    .toLowerCase();

  const method = IMAGE_PROVIDERS[provider];
  if (!method) {
    throw new Error(
      `Image generation not supported for provider: ${provider}. Supported: ${Object.keys(IMAGE_PROVIDERS).join(', ')}`,
    );
  }

  try {
    return await method({
      ...request,
      prompt: redactPrompt(request.prompt),
    });
  } catch (primaryError) {
    const fallback = Features.image.fallbackProvider;
    if (fallback && fallback !== provider && IMAGE_PROVIDERS[fallback]) {
      console.warn(
        `[llmGateway.generateImage] ${provider} failed; falling back to ${fallback}`,
      );
      return IMAGE_PROVIDERS[fallback]({
        ...request,
        provider: fallback,
        prompt: redactPrompt(request.prompt),
      });
    }
    throw primaryError;
  }
}

/**
 * Generate video (OpenAI Videos / Kling).
 */
export async function generateVideo(
  request: VideoGenerationRequest,
): Promise<VideoGenerationResponse> {
  if (!Features.video.enabled) {
    const err = new Error('Video generation is disabled (VIDEO_GEN_ENABLED=false)');
    (err as Error & { code?: string }).code = 'VIDEO_GEN_DISABLED';
    throw err;
  }

  const provider = (request.provider || Features.video.defaultProvider || 'openai')
    .trim()
    .toLowerCase();

  const method = VIDEO_PROVIDERS[provider];
  if (!method) {
    throw new Error(
      `Video generation not supported for provider: ${provider}. Supported: ${Object.keys(VIDEO_PROVIDERS).join(', ')}`,
    );
  }

  try {
    return await method({
      ...request,
      prompt: redactPrompt(request.prompt),
    });
  } catch (primaryError) {
    const fallback = Features.video.fallbackProvider;
    if (fallback && fallback !== provider && VIDEO_PROVIDERS[fallback]) {
      console.warn(
        `[llmGateway.generateVideo] ${provider} failed; falling back to ${fallback}`,
      );
      return VIDEO_PROVIDERS[fallback]({
        ...request,
        provider: fallback,
        prompt: redactPrompt(request.prompt),
      });
    }
    throw primaryError;
  }
}
