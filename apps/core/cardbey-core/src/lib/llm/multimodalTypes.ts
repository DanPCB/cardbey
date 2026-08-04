/**
 * Phase 3 — multimodal / embeddings request & response types for llmGateway.
 */

export type VisionRequest = {
  /** Raw base64, data URL, or Buffer. */
  image: string | Buffer;
  prompt: string;
  mediaType?: string;
  system?: string;
  provider?: string;
  model?: string;
  maxTokens?: number;
  detail?: 'low' | 'high' | 'auto';
  purpose?: string;
};

export type VisionResponse = {
  content: string;
  provider: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  raw?: unknown;
};

export type EmbeddingRequest = {
  text: string | string[];
  provider?: 'openai' | 'voyage' | 'cohere' | string;
  model?: string;
  purpose?: string;
};

export type EmbeddingResponse = {
  embeddings: number[][];
  provider: string;
  model: string;
  usage?: {
    promptTokens: number;
  };
};

export type ImageGenerationRequest = {
  prompt: string;
  provider?: 'dalle' | 'ideogram' | 'recraft' | string;
  model?: string;
  size?: string;
  count?: number;
  style?: string;
  /** Extra params for logo generators (storeName, industry, …). */
  meta?: Record<string, unknown>;
  purpose?: string;
};

export type ImageGenerationResponse = {
  images: string[];
  provider: string;
  model: string;
  raw?: unknown;
};

export type VideoGenerationRequest = {
  prompt: string;
  provider?: 'openai' | 'kling' | string;
  model?: string;
  duration?: number;
  resolution?: string;
  purpose?: string;
  /** Pass-through for existing video contract context. */
  input?: Record<string, unknown>;
  context?: Record<string, unknown>;
};

export type VideoGenerationResponse = {
  videoUrl: string;
  provider: string;
  model: string;
  status: 'processing' | 'completed' | 'failed';
  raw?: unknown;
};

export type NormalizedImage = {
  base64: string;
  mediaType: string;
  dataUrl: string;
};
