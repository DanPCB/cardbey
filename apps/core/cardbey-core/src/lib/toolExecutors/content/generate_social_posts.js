/**
 * generate_social_posts — standalone social content generation for stores.
 */

import { llmGateway } from '../../llm/llmGateway.ts';
import { getPrismaClient } from '../../prisma.js';

const FALLBACK_HASHTAGS = ['#business', '#local', '#shoplocal'];

/**
 * @param {unknown} raw
 */
function parsePostsPayload(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return { posts: parsed, suggestedHashtags: FALLBACK_HASHTAGS };
    }
    if (parsed && typeof parsed === 'object') {
      const posts = Array.isArray(parsed.posts) ? parsed.posts : [];
      const suggestedHashtags = Array.isArray(parsed.suggestedHashtags)
        ? parsed.suggestedHashtags.filter((t) => typeof t === 'string')
        : FALLBACK_HASHTAGS;
      return { posts, suggestedHashtags };
    }
  } catch {
    return { posts: [{ platform: 'general', caption: cleaned, hashtags: FALLBACK_HASHTAGS }], suggestedHashtags: FALLBACK_HASHTAGS };
  }
  return null;
}

/**
 * @param {object} input
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const start = Date.now();
  const storeId =
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    (typeof context?.storeId === 'string' && context.storeId.trim()) ||
    '';

  const topic =
    (typeof input?.context === 'string' && input.context.trim()) ||
    (typeof input?.topic === 'string' && input.topic.trim()) ||
    (typeof context?.goal === 'string' && context.goal.trim()) ||
    'general promotion';

  let storeName = typeof input?.storeName === 'string' ? input.storeName.trim() : '';
  let productNames = [];

  if (storeId) {
    try {
      const prisma = getPrismaClient();
      const [store, products] = await Promise.all([
        prisma.business.findFirst({
          where: { id: storeId },
          select: { name: true, type: true, brandTone: true },
        }),
        prisma.product.findMany({
          where: { businessId: storeId, deletedAt: null },
          take: 8,
          select: { name: true },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      if (store?.name) storeName = store.name;
      productNames = products.map((p) => p.name).filter(Boolean);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[generate_social_posts] store load failed:', err?.message ?? err);
      }
    }
  }

  const label = storeName || 'this store';
  const productLine = productNames.length
    ? `Products: ${productNames.join(', ')}`
    : 'Products: none listed yet';

  const prompt =
    `Generate 3 engaging social media posts for "${label}".\n` +
    `Topic: ${topic}\n` +
    `${productLine}\n\n` +
    'Return ONLY JSON:\n' +
    '{"posts":[{"platform":"instagram|facebook|general","caption":"...","hashtags":["#tag"]}],"suggestedHashtags":["#tag"]}';

  const tenantKey = storeId || 'default';
  let posts = [];
  let suggestedHashtags = FALLBACK_HASHTAGS;

  try {
    const result = await llmGateway.generate({
      purpose: 'generate_social_posts',
      prompt,
      tenantKey,
      maxTokens: 900,
      responseFormat: 'json',
      temperature: 0.65,
    });
    const parsed = parsePostsPayload(result?.text);
    if (parsed) {
      posts = parsed.posts;
      suggestedHashtags = parsed.suggestedHashtags?.length ? parsed.suggestedHashtags : FALLBACK_HASHTAGS;
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[generate_social_posts] LLM error:', err?.message ?? err);
    }
  }

  if (!posts.length) {
    posts = [
      {
        platform: 'general',
        caption: `Discover what's new at ${label}! ${topic}.`,
        hashtags: suggestedHashtags,
      },
    ];
  }

  return {
    status: 'ok',
    output: {
      ok: true,
      storeId: storeId || null,
      storeName: label,
      topic,
      posts,
      suggestedHashtags,
      durationMs: Date.now() - start,
    },
  };
}

export default execute;
