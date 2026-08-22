/**
 * Cohere embeddings (Phase 3 optional provider).
 */

import type { EmbeddingRequest, EmbeddingResponse } from '../multimodalTypes.js';

export async function cohereEmbedding(
  request: EmbeddingRequest,
): Promise<EmbeddingResponse> {
  const apiKey = process.env.COHERE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('COHERE_API_KEY is not set');
  }

  const model =
    request.model?.trim() || process.env.COHERE_EMBEDDING_MODEL?.trim() || 'embed-english-v3.0';
  const texts = Array.isArray(request.text) ? request.text : [request.text];

  const res = await fetch('https://api.cohere.com/v1/embed', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      texts,
      input_type: 'search_document',
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Cohere embeddings error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    embeddings?: number[][];
    meta?: { billed_units?: { input_tokens?: number } };
  };

  return {
    embeddings: data.embeddings ?? [],
    provider: 'cohere',
    model,
    usage: {
      promptTokens: data.meta?.billed_units?.input_tokens ?? 0,
    },
  };
}
