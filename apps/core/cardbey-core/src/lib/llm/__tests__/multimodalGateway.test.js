/**
 * @vitest-environment node
 * Phase 3 — vision / embeddings / image / video facades
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../providers/anthropicVision.js', () => ({
  anthropicVision: vi.fn(),
}));
vi.mock('../providers/openaiVision.js', () => ({
  openaiVision: vi.fn(),
}));
vi.mock('../providers/openaiEmbedding.js', () => ({
  openaiEmbedding: vi.fn(),
}));
vi.mock('../providers/voyageEmbedding.js', () => ({
  voyageEmbedding: vi.fn(),
}));
vi.mock('../providers/cohereEmbedding.js', () => ({
  cohereEmbedding: vi.fn(),
}));
vi.mock('../providers/imageGeneration.js', () => ({
  dalleGeneration: vi.fn(),
  ideogramGeneration: vi.fn(),
  recraftGeneration: vi.fn(),
}));
vi.mock('../providers/videoGeneration.js', () => ({
  openaiVideoGeneration: vi.fn(),
  klingVideoGeneration: vi.fn(),
}));

import { anthropicVision } from '../providers/anthropicVision.js';
import { openaiEmbedding } from '../providers/openaiEmbedding.js';
import { voyageEmbedding } from '../providers/voyageEmbedding.js';
import { dalleGeneration } from '../providers/imageGeneration.js';
import { openaiVideoGeneration } from '../providers/videoGeneration.js';
import {
  analyzeVision,
  embed,
  generateImage,
  generateVideo,
} from '../multimodalGateway.ts';

describe('multimodalGateway', () => {
  /** @type {Record<string, string | undefined>} */
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.USE_LLM_GATEWAY = 'true';
    process.env.VISION_ENABLED = 'true';
    process.env.EMBEDDING_ENABLED = 'true';
    process.env.IMAGE_GEN_ENABLED = 'true';
    process.env.VIDEO_GEN_ENABLED = 'true';
    process.env.ENABLE_PII_REDACTION = 'true';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('analyzeVision routes to anthropic', async () => {
    anthropicVision.mockResolvedValue({
      content: 'A storefront sign',
      provider: 'anthropic',
      model: 'claude-sonnet',
    });

    const result = await analyzeVision({
      image: 'base64image',
      prompt: 'What is this?',
      provider: 'anthropic',
    });

    expect(result.provider).toBe('anthropic');
    expect(result.content).toBe('A storefront sign');
    expect(anthropicVision).toHaveBeenCalledOnce();
  });

  it('analyzeVision redacts PII from prompt before provider call', async () => {
    anthropicVision.mockImplementation(async (req) => ({
      content: 'ok',
      provider: 'anthropic',
      model: 'claude',
      raw: req,
    }));

    await analyzeVision({
      image: 'base64image',
      prompt: 'Email: test@example.com please classify',
      provider: 'anthropic',
    });

    const sent = anthropicVision.mock.calls[0][0];
    expect(sent.prompt).not.toContain('test@example.com');
  });

  it('analyzeVision throws when VISION_ENABLED=false', async () => {
    process.env.VISION_ENABLED = 'false';
    await expect(
      analyzeVision({ image: 'x', prompt: 'hi', provider: 'anthropic' }),
    ).rejects.toMatchObject({ code: 'VISION_DISABLED' });
  });

  it('embed routes to openai and supports voyage', async () => {
    openaiEmbedding.mockResolvedValue({
      embeddings: [[0.1, 0.2]],
      provider: 'openai',
      model: 'text-embedding-3-small',
    });
    voyageEmbedding.mockResolvedValue({
      embeddings: [[0.3, 0.4]],
      provider: 'voyage',
      model: 'voyage-2',
    });

    const openaiResult = await embed({ text: 'hello', provider: 'openai' });
    expect(openaiResult.provider).toBe('openai');
    expect(openaiResult.embeddings[0]).toEqual([0.1, 0.2]);

    const voyageResult = await embed({ text: 'hello', provider: 'voyage' });
    expect(voyageResult.provider).toBe('voyage');
  });

  it('generateImage routes to dalle', async () => {
    dalleGeneration.mockResolvedValue({
      images: ['https://example.com/img.png'],
      provider: 'dalle',
      model: 'dall-e-3',
    });

    const result = await generateImage({
      prompt: 'A cafe storefront',
      provider: 'dalle',
    });

    expect(result.provider).toBe('dalle');
    expect(result.images).toHaveLength(1);
  });

  it('generateVideo routes to openai', async () => {
    openaiVideoGeneration.mockResolvedValue({
      videoUrl: 'https://example.com/v.mp4',
      provider: 'openai',
      model: 'sora-2',
      status: 'completed',
    });

    const result = await generateVideo({
      prompt: 'Promo video',
      provider: 'openai',
    });

    expect(result.provider).toBe('openai');
    expect(result.status).toBe('completed');
  });
});
