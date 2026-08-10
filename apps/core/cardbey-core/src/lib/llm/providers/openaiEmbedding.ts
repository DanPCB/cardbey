/**
 * OpenAI embeddings (Phase 3).
 */

import OpenAI from 'openai';
import type { EmbeddingRequest, EmbeddingResponse } from '../multimodalTypes.js';

const DEFAULT_MODEL = 'text-embedding-3-small';

export async function openaiEmbedding(
  request: EmbeddingRequest,
): Promise<EmbeddingResponse> {
  if (process.env.NODE_ENV === 'test') {
    const inputs = Array.isArray(request.text) ? request.text : [request.text];
    return {
      embeddings: inputs.map((t) => mockEmbedding(String(t ?? ''))),
      provider: 'openai',
      model: request.model || DEFAULT_MODEL,
      usage: { promptTokens: 0 },
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const model = request.model?.trim() || DEFAULT_MODEL;
  const openai = new OpenAI({ apiKey, timeout: 30000, maxRetries: 2 });
  const response = await openai.embeddings.create({
    model,
    input: request.text,
  });

  return {
    embeddings: (response.data ?? []).map((d) => d.embedding),
    provider: 'openai',
    model: response.model || model,
    usage: {
      promptTokens: response.usage?.total_tokens ?? 0,
    },
  };
}

function mockEmbedding(text: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  const out = new Array(1536);
  for (let i = 0; i < out.length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = (state / 0xffffffff) * 0.1 - 0.05;
  }
  return out;
}
