/**
 * Voyage AI embeddings (Phase 3 optional provider).
 */

import type { EmbeddingRequest, EmbeddingResponse } from '../multimodalTypes.js';

export async function voyageEmbedding(
  request: EmbeddingRequest,
): Promise<EmbeddingResponse> {
  const apiKey = process.env.VOYAGE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY is not set');
  }

  const model = request.model?.trim() || process.env.VOYAGE_EMBEDDING_MODEL?.trim() || 'voyage-2';
  const input = Array.isArray(request.text) ? request.text : [request.text];

  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Voyage embeddings error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>;
    model?: string;
    usage?: { total_tokens?: number };
  };

  return {
    embeddings: (data.data ?? []).map((d) => d.embedding ?? []),
    provider: 'voyage',
    model: data.model || model,
    usage: { promptTokens: data.usage?.total_tokens ?? 0 },
  };
}
