/**
 * MCP adapter: read-only counts for products, promotions, and mission pipelines (user/store scoped).
 */

import { getPrismaClient } from '../../prisma.js';

/**
 * @param {object} args
 * @param {string} [args.storeId]
 * @param {import('../invocationEnvelope.js').McpInvocationEnvelope} envelope
 */
export async function invokeContextAnalytics(args = {}, envelope) {
  const adapterId = 'mcp_context_analytics';
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
      error: { code: 'USER_REQUIRED', message: 'MCP context analytics requires userId on envelope' },
      metadata: metaBase,
    };
  }

  const storeId =
    args?.storeId != null && String(args.storeId).trim() ? String(args.storeId).trim() : '';
  if (!storeId) {
    return {
      success: false,
      error: { code: 'STORE_REQUIRED', message: 'storeId required' },
      metadata: metaBase,
    };
  }

  const prisma = getPrismaClient();
  try {
    const owned = await prisma.business.findFirst({
      where: { id: storeId, userId },
      select: { id: true },
    });
    if (!owned) {
      return {
        success: false,
        error: { code: 'STORE_NOT_FOUND', message: 'Store not found or not owned by user' },
        metadata: { ...metaBase, storeId },
      };
    }

    const [productCount, promotionCount, missionPipelineCount] = await Promise.all([
      prisma.product.count({ where: { businessId: storeId, deletedAt: null } }),
      prisma.promotion.count({ where: { storeId } }),
      prisma.missionPipeline.count({
        where: {
          createdBy: userId,
          targetId: storeId,
          targetType: { in: ['store', 'draft_store'] },
        },
      }),
    ]);

    const retrievedAt = new Date().toISOString();

    return {
      success: true,
      data: {
        resourceType: 'analytics_context',
        storeId,
        summary: {
          productCount,
          promotionCount,
          missionPipelineCount,
          retrievedAt,
        },
      },
      metadata: { ...metaBase, storeId, retrievedAt },
    };
  } catch (err) {
    const message = err?.message || String(err);
    return {
      success: false,
      error: { code: 'MCP_CONTEXT_ANALYTICS_FAILED', message: message.slice(0, 500) },
      metadata: metaBase,
    };
  }
}
