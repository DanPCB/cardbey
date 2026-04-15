/**
 * MCP adapter: read-only recent MissionPipeline rows for the envelope user (optional store scope).
 */

import { getPrismaClient } from '../../prisma.js';

/**
 * @param {object} args
 * @param {number} [args.limit]
 * @param {string} [args.storeId]
 * @param {import('../invocationEnvelope.js').McpInvocationEnvelope} envelope
 */
export async function invokeContextMissions(args = {}, envelope) {
  const adapterId = 'mcp_context_missions';
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
      error: { code: 'USER_REQUIRED', message: 'MCP context missions requires userId on envelope' },
      metadata: metaBase,
    };
  }

  let limit = 10;
  if (typeof args?.limit === 'number' && Number.isFinite(args.limit)) {
    limit = Math.min(50, Math.max(1, Math.trunc(args.limit)));
  }

  const storeFilter =
    args?.storeId != null && String(args.storeId).trim() ? String(args.storeId).trim() : null;

  const prisma = getPrismaClient();
  try {
    if (storeFilter) {
      const owned = await prisma.business.findFirst({
        where: { id: storeFilter, userId },
        select: { id: true },
      });
      if (!owned) {
        return {
          success: false,
          error: { code: 'STORE_NOT_FOUND', message: 'Store not found or not owned by user' },
          metadata: { ...metaBase, storeId: storeFilter },
        };
      }
    }

    const where = {
      createdBy: userId,
      ...(storeFilter
        ? {
            targetId: storeFilter,
            targetType: { in: ['store', 'draft_store'] },
          }
        : {}),
    };

    const missions = await prisma.missionPipeline.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        status: true,
        runState: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
      },
    });

    return {
      success: true,
      data: {
        resourceType: 'missions_context',
        userId,
        storeIdScoped: storeFilter,
        missionCount: missions.length,
        missions: missions.map((m) => ({
          id: m.id,
          type: m.type,
          status: m.status,
          runState: m.runState,
          title: m.title ?? null,
          createdAt: m.createdAt,
          completedAt: m.completedAt ?? (m.status === 'completed' ? m.updatedAt : null),
        })),
      },
      metadata: { ...metaBase, count: missions.length },
    };
  } catch (err) {
    const message = err?.message || String(err);
    return {
      success: false,
      error: { code: 'MCP_CONTEXT_MISSIONS_FAILED', message: message.slice(0, 500) },
      metadata: metaBase,
    };
  }
}
