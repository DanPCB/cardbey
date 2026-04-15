/**
 * MCP adapter: read-only published products for the envelope user (same rules as mcpRoutes).
 * Leaf node — no orchestration; Mission Pipeline / tool executor decides when to invoke.
 */

import { getPrismaClient } from '../../prisma.js';

function parseBoundedInt(val, { min, max, fallback }) {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    if (typeof val === 'string' && /^\d+$/.test(val.trim())) {
      const n = parseInt(val, 10);
      if (Number.isFinite(n) && n >= min && n <= max) return n;
    }
    return fallback;
  }
  const n = Math.trunc(val);
  if (n >= min && n <= max) return n;
  return fallback;
}

function mapProductToResource(p) {
  return {
    resourceType: 'product',
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    category: p.category ?? null,
    price: p.price ?? null,
    currency: p.currency ?? null,
    imageUrl: p.imageUrl ?? null,
    sku: p.sku ?? null,
    isPublished: Boolean(p.isPublished),
    updatedAt: p.updatedAt,
  };
}

/**
 * @param {object} args
 * @param {number} [args.limit]
 * @param {number} [args.offset]
 * @param {import('../invocationEnvelope.js').McpInvocationEnvelope} envelope
 * @returns {Promise<{ success: boolean, data?: object, error?: { code: string, message: string }, metadata: object }>}
 */
export async function invokeContextProducts(args = {}, envelope) {
  const adapterId = 'mcp_context_products';
  const metaBase = {
    adapterId,
    source: envelope?.source ?? 'unknown',
    missionId: envelope?.missionId ?? null,
    tenantKey: envelope?.tenantKey ?? envelope?.tenantId ?? null,
  };

  const userId = envelope?.userId != null ? String(envelope.userId).trim() : '';
  if (!userId) {
    return {
      success: false,
      error: { code: 'USER_REQUIRED', message: 'MCP context products requires userId on invocation envelope' },
      metadata: metaBase,
    };
  }

  const limit = parseBoundedInt(args?.limit, { min: 1, max: 100, fallback: 20 });
  const offset = parseBoundedInt(args?.offset, { min: 0, max: 10_000_000, fallback: 0 });

  const prisma = getPrismaClient();
  try {
    const [total, products] = await Promise.all([
      prisma.product.count({
        where: { isPublished: true, business: { userId } },
      }),
      prisma.product.findMany({
        where: { isPublished: true, business: { userId } },
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          price: true,
          currency: true,
          imageUrl: true,
          sku: true,
          isPublished: true,
          updatedAt: true,
        },
      }),
    ]);

    const nextOffset = offset + products.length < total ? offset + products.length : null;

    return {
      success: true,
      data: {
        resources: products.map(mapProductToResource),
        pagination: { limit, offset, total, nextOffset },
      },
      metadata: {
        ...metaBase,
        count: products.length,
      },
    };
  } catch (err) {
    const message = err?.message || String(err);
    return {
      success: false,
      error: { code: 'MCP_CONTEXT_PRODUCTS_FAILED', message: message.slice(0, 500) },
      metadata: metaBase,
    };
  }
}
