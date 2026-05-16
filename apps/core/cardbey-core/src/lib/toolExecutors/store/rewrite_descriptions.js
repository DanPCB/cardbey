/**
 * Store tool: rewrite_descriptions.
 * Uses LLM via llmGateway to generate improved product descriptions, with graceful fallback.
 * Input: { storeId, tenantId? }.
 * Output: { rewrittenCount, items: [{ id, name, original, improved }] }.
 */

import { llmGateway } from '../../llm/llmGateway.ts';
import { getPrismaClient } from '../../../lib/prisma.js';

const MAX_PRODUCTS_PER_CALL = 10;

export async function execute(input = {}) {
  const prisma = getPrismaClient();
  const storeId = typeof input?.storeId === 'string' ? input.storeId.trim() : '';
  if (!storeId) {
    return { status: 'ok', output: { rewrittenCount: 0, items: [] } };
  }

  console.log('[rewrite_descriptions] storeId:', storeId);

  let products = [];
  try {
    products = await prisma.product.findMany({
      where: { businessId: storeId, deletedAt: null, isPublished: true },
      take: MAX_PRODUCTS_PER_CALL,
      select: { id: true, name: true, description: true },
      orderBy: { createdAt: 'desc' },
    });
  } catch (err) {
    console.error('[rewrite_descriptions] prisma error:', err);
    products = [];
  }

  console.log('[rewrite_descriptions] products found:', products.length);

  if (!products.length) {
    return { status: 'ok', output: { rewrittenCount: 0, items: [] } };
  }

  const tenantKey =
    (typeof input?.tenantId === 'string' && input.tenantId.trim()) || storeId;

  let improvedDescriptions = [];
  try {
    const result = await llmGateway.generate({
      purpose: 'rewrite_descriptions',
      prompt: `Rewrite these ${products.length} product descriptions to be more engaging and customer-focused for a small business.

Products:
${products
  .map((p, i) => `${i + 1}. ${p.name}: ${p.description ?? p.name}`)
  .join('\n')}

Return a JSON array with exactly ${products.length} strings in the same order:
["improved description 1", "improved description 2", ...]

Return ONLY the JSON array, no other text.`,
      tenantKey,
      maxTokens: 3000,
      responseFormat: 'json',
      temperature: 0.7,
      provider: 'anthropic',
    });

    console.log('[rewrite] LLM text:', result?.text?.slice(0, 200) ?? 'NULL - error:', result?.error);

    if (result?.text) {
      try {
        const cleaned = result.text
          .replace(/^```json\s*\n?/i, '')
          .replace(/^```\s*\n?/i, '')
          .replace(/\n?```\s*$/i, '')
          .trim();
        // Extract first complete array so trailing fences or truncated text don't break parse
        const firstBracket = cleaned.indexOf('[');
        const lastBracket = cleaned.lastIndexOf(']');
        const jsonSlice =
          firstBracket >= 0 && lastBracket > firstBracket
            ? cleaned.slice(firstBracket, lastBracket + 1)
            : cleaned;
        const parsed = JSON.parse(jsonSlice);
        if (Array.isArray(parsed)) {
          improvedDescriptions = parsed;
        }
      } catch (parseErr) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[rewrite_descriptions] JSON parse failed:',
            parseErr?.message,
            'cleaned length:',
            result.text?.length
          );
        }
        improvedDescriptions = [];
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[rewrite_descriptions] LLM error:', err?.message ?? err);
    }
    improvedDescriptions = [];
  }

  const items = products.map((p, i) => ({
    id: p.id,
    name: p.name,
    original: p.description ?? null,
    improved:
      typeof improvedDescriptions[i] === 'string'
        ? improvedDescriptions[i]
        : p.description ?? null,
  }));

  const rewrittenCount = items.filter(
    (item) => (item.improved ?? '') !== (item.original ?? '')
  ).length;

  return {
    status: 'ok',
    output: {
      rewrittenCount,
      items,
    },
  };
}
