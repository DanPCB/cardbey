/**
 * MCP adapter: read-only business / store context for the envelope user (internal Prisma).
 * Leaf node — no orchestration; Mission Pipeline / tool executor decides when to invoke.
 */

import { getPrismaClient } from '../../prisma.js';

/**
 * @param {string} userId
 * @param {string | null} storeId
 */
async function loadBusinessSummariesForUser(userId, storeId) {
  const prisma = getPrismaClient();
  const baseWhere = { userId };

  if (storeId) {
    const row = await prisma.business.findFirst({
      where: { ...baseWhere, id: storeId },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        isActive: true,
        publishedAt: true,
        region: true,
        updatedAt: true,
      },
    });

    if (!row) {
      return { scope: 'single', businesses: [], missingStoreId: storeId };
    }

    const [productCount, publishedProductCount] = await Promise.all([
      prisma.product.count({ where: { businessId: row.id, deletedAt: null } }),
      prisma.product.count({ where: { businessId: row.id, deletedAt: null, isPublished: true } }),
    ]);

    return {
      scope: 'single',
      businesses: [
        {
          id: row.id,
          name: row.name,
          slug: row.slug,
          type: row.type,
          isActive: row.isActive,
          publishedAt: row.publishedAt,
          region: row.region,
          updatedAt: row.updatedAt,
          productCount,
          publishedProductCount,
        },
      ],
    };
  }

  const rows = await prisma.business.findMany({
    where: baseWhere,
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      isActive: true,
      publishedAt: true,
      region: true,
      updatedAt: true,
    },
  });

  if (rows.length === 0) {
    return { scope: 'all', businesses: [] };
  }

  const ids = rows.map((r) => r.id);
  const [totals, publishedRows] = await Promise.all([
    prisma.product.groupBy({
      by: ['businessId'],
      where: { businessId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.product.groupBy({
      by: ['businessId'],
      where: { businessId: { in: ids }, deletedAt: null, isPublished: true },
      _count: { _all: true },
    }),
  ]);

  const totalMap = Object.fromEntries(totals.map((t) => [t.businessId, t._count._all]));
  const pubMap = Object.fromEntries(publishedRows.map((t) => [t.businessId, t._count._all]));

  return {
    scope: 'all',
    businesses: rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      type: row.type,
      isActive: row.isActive,
      publishedAt: row.publishedAt,
      region: row.region,
      updatedAt: row.updatedAt,
      productCount: totalMap[row.id] ?? 0,
      publishedProductCount: pubMap[row.id] ?? 0,
    })),
  };
}

/**
 * @param {object} args
 * @param {string} [args.storeId] — Business id (store); must belong to envelope user
 * @param {import('../invocationEnvelope.js').McpInvocationEnvelope} envelope
 * @returns {Promise<{ success: boolean, data?: object, error?: { code: string, message: string }, metadata: object }>}
 */
export async function invokeContextBusiness(args = {}, envelope) {
  const adapterId = 'mcp_context_business';
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
      error: { code: 'USER_REQUIRED', message: 'MCP context business requires userId on invocation envelope' },
      metadata: metaBase,
    };
  }

  const rawStore =
    args?.storeId != null && String(args.storeId).trim() ? String(args.storeId).trim() : null;

  try {
    const payload = await loadBusinessSummariesForUser(userId, rawStore);

    if (rawStore && payload.scope === 'single' && payload.businesses.length === 0) {
      return {
        success: false,
        error: {
          code: 'STORE_NOT_FOUND',
          message: 'No business found for this store id and user',
        },
        metadata: { ...metaBase, storeId: rawStore },
      };
    }

    return {
      success: true,
      data: {
        resourceType: 'business_context',
        scope: payload.scope,
        businesses: payload.businesses,
      },
      metadata: {
        ...metaBase,
        count: payload.businesses.length,
        ...(rawStore ? { storeId: rawStore } : {}),
      },
    };
  } catch (err) {
    const message = err?.message || String(err);
    return {
      success: false,
      error: { code: 'MCP_CONTEXT_BUSINESS_FAILED', message: message.slice(0, 500) },
      metadata: metaBase,
    };
  }
}
