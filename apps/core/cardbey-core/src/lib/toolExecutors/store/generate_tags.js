/**
 * Store tool: generate_tags.
 * Uses LLM via llmGateway to generate store-level tags, with graceful fallback.
 * Input: { storeId, tenantId? }.
 * Output: { tags: string[], count: number } plus legacy counters.
 */

import { llmGateway } from '../../llm/llmGateway.ts';
import { getPrismaClient } from '../../../lib/prisma.js';

export async function execute(input = {}) {
  const prisma = getPrismaClient();
  const storeId = typeof input?.storeId === 'string' ? input.storeId.trim() : '';
  if (!storeId) {
    return { status: 'ok', output: { tags: [], count: 0, taggedCount: 0, products: [], generatedTagsCount: 0 } };
  }

  console.log('[generate_tags] storeId:', storeId);

  let products = [];
  let store = null;
  try {
    [products, store] = await Promise.all([
      prisma.product.findMany({
        where: { businessId: storeId, deletedAt: null },
        take: 20,
        select: { name: true, description: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.business.findFirst({
        where: { id: storeId },
        select: { name: true, type: true },
      }),
    ]);
  } catch (err) {
    console.error('[generate_tags] prisma error:', err);
    products = [];
    store = null;
  }

  console.log('[generate_tags] products found:', products.length);

  const contextParts = [];
  if (store) {
    contextParts.push(
      `Business: ${store.name} (${store.type ?? 'retail'})`
    );
  }
  if (products.length) {
    contextParts.push(
      'Products: ' + products.map((p) => p.name).join(', ')
    );
  }
  const context = contextParts.join('\n');

  if (!context.trim()) {
    return { status: 'ok', output: { tags: [], count: 0, taggedCount: 0, products: [], generatedTagsCount: 0 } };
  }

  const tenantKey =
    (typeof input?.tenantId === 'string' && input.tenantId.trim()) || storeId;

  let tags = [];
  try {
    const result = await llmGateway.generate({
      purpose: 'generate_tags',
      prompt:
        'You are a retail SEO expert. Generate relevant search and discovery tags. ' +
        'Return ONLY a JSON array of strings, max 20 tags.\n\n' +
        `Generate tags for this store:\n\n${context}\n\nReturn: ["tag1","tag2",...]`,
      tenantKey,
      maxTokens: 400,
      responseFormat: 'json',
      temperature: 0.4,
      provider: 'anthropic',
    });

    if (result?.text) {
      const cleaned = result.text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned || '[]');
      if (Array.isArray(parsed)) {
        tags = parsed.filter((t) => typeof t === 'string').slice(0, 20);
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[generate_tags] LLM error:', err?.message ?? err);
    }
    tags = [];
  }

  console.log('[generate_tags] tags from LLM:', tags.length, tags.slice(0, 3));

  const count = tags.length;

  return {
    status: 'ok',
    output: {
      tags,
      count,
      // legacy counters for backward compatibility
      taggedCount: count,
      products: [],
      generatedTagsCount: count,
    },
  };
}
