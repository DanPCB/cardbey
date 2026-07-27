/**
 * MCP adapter: read-only promotions for a store (user must own business id = storeId).
 */

import { getPrismaClient } from '../../prisma.js';

const ACTIVE_STATUSES = ['active', 'planned'];

/**
 * @param {object} args
 * @param {string} [args.storeId]
 * @param {import('../invocationEnvelope.js').McpInvocationEnvelope} envelope
 */
export async function invokeContextPromotions(args = {}, envelope) {
  const adapterId = 'mcp_context_promotions';
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
      error: { code: 'USER_REQUIRED', message: 'MCP context promotions requires userId on envelope' },
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

    const promotions = await prisma.promotion.findMany({
      where: {
        storeId,
        status: { in: ACTIVE_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        message: true,
        ctaLabel: true,
        ctaUrl: true,
        status: true,
        type: true,
        createdAt: true,
        metadataJson: true,
      },
    });

    return {
      success: true,
      data: {
        resourceType: 'promotions_context',
        storeId,
        promotionCount: promotions.length,
        promotions: promotions.map((p) => {
          const meta = p.metadataJson && typeof p.metadataJson === 'object' ? p.metadataJson : {};
          return {
            id: p.id,
            title: p.title,
            message: p.message ?? null,
            ctaLabel: p.ctaLabel ?? null,
            type: p.type,
            status: p.status,
            createdAt: p.createdAt,
            landingPageUrl: meta.landingPageUrl ?? p.ctaUrl ?? null,
            hasQrCode: Boolean(meta.qrCodeUrl),
          };
        }),
      },
      metadata: { ...metaBase, storeId, count: promotions.length },
    };
  } catch (err) {
    const message = err?.message || String(err);
    return {
      success: false,
      error: { code: 'MCP_CONTEXT_PROMOTIONS_FAILED', message: message.slice(0, 500) },
      metadata: metaBase,
    };
  }
}
