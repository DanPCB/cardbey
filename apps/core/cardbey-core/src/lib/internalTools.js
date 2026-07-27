/**
 * Internal tool registry for Mission Engine: store operations (permission-scoped, reversible).
 * Only runs when AgentRun.input.intent matches a key in INTERNAL_TOOLS.
 * Each tool: canAccessStore(storeId, user) check, execute, AuditEvent, return summary.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { resolveDraftForStore } from './draftResolver.js';
import { repairCatalog } from '../services/draftStore/draftStoreService.js';

export const INTERNAL_TOOLS = new Set([
  'store_fix_image_mismatch',
  'store_regenerate_hero',
  'store_rebuild_public_preview',
]);

/**
 * Check whether the user can access the store (owner or dev admin). Does not throw.
 * @param {object} prisma
 * @param {string} storeId
 * @param {string} userId - mission createdByUserId or actor
 * @param {{ isDevAdmin?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
export async function canAccessStore(prisma, storeId, userId, opts = {}) {
  if (!storeId || !userId) return false;
  const business = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, userId: true },
  }).catch(() => null);
  if (!business) return false;
  const isDevAdmin = opts.isDevAdmin === true || (process.env.NODE_ENV !== 'production' && opts.isDevAdmin !== false);
  if (isDevAdmin) return true;
  return business.userId === userId;
}

/**
 * Log an audit event for internal tool execution. Non-fatal on failure.
 */
async function logInternalToolAudit(prisma, { entityType, entityId, action, actorType, actorId, reason, metadata }) {
  try {
    await prisma.auditEvent.create({
      data: {
        entityType: entityType || 'Business',
        entityId,
        action: action || 'internal_tool',
        actorType: actorType || 'automation',
        actorId: actorId || null,
        reason: reason || 'MISSION_INTERNAL_TOOL',
        metadata: metadata || null,
      },
    });
  } catch (err) {
    console.warn('[internalTools] AuditEvent create failed (non-fatal):', err?.message || err);
  }
}

/**
 * store_fix_image_mismatch: resolve draft for store, run repairCatalog (stableKey/catalog consistency).
 * Requires runInput.storeId. Uses mission createdByUserId for canAccessStore.
 * @returns {Promise<{ ok: boolean, summary?: object, error?: string }>}
 */
async function storeFixImageMismatch(prisma, missionId, runInput, run) {
  const storeId = runInput?.storeId && typeof runInput.storeId === 'string' ? runInput.storeId.trim() : null;
  if (!storeId) {
    return { ok: false, error: 'storeId is required for store_fix_image_mismatch' };
  }
  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    select: { createdByUserId: true },
  }).catch(() => null);
  if (!mission) {
    return { ok: false, error: 'Mission not found' };
  }
  const userId = mission.createdByUserId;
  const allowed = await canAccessStore(prisma, storeId, userId);
  if (!allowed) {
    return { ok: false, error: 'Permission denied: you do not have access to this store' };
  }
  const resolved = await resolveDraftForStore(prisma, storeId, runInput.generationRunId || null);
  const draftId = resolved?.draft?.id;
  if (!draftId || resolved.status !== 'ready') {
    return {
      ok: false,
      error: resolved?.status === 'not_found' ? 'No draft found for this store' : `Draft not ready (status: ${resolved?.status || 'unknown'})`,
    };
  }
  let result;
  try {
    result = await repairCatalog(draftId);
  } catch (err) {
    const msg = err?.message || String(err);
    return { ok: false, error: msg.slice(0, 300) };
  }
  if (!result.ok) {
    return {
      ok: false,
      error: result.message || 'repairCatalog failed',
      summary: { removedCount: result.removedCount, remainingCount: result.remainingCount, needRegeneration: result.needRegeneration },
    };
  }
  await logInternalToolAudit(prisma, {
    entityType: 'Business',
    entityId: storeId,
    action: 'store_fix_image_mismatch',
    actorType: 'automation',
    actorId: missionId,
    reason: 'MISSION_INTERNAL_TOOL',
    metadata: {
      missionId,
      runId: run?.id,
      draftId,
      storeId,
      removedCount: result.removedCount ?? 0,
      remainingCount: result.remainingCount ?? 0,
    },
  });
  return {
    ok: true,
    summary: {
      tool: 'store_fix_image_mismatch',
      storeId,
      draftId,
      removedCount: result.removedCount ?? 0,
      remainingCount: result.remainingCount ?? 0,
      message: `Catalog repair completed. Removed ${result.removedCount ?? 0} item(s); ${result.remainingCount ?? 0} remaining.`,
    },
  };
}

/**
 * store_regenerate_hero: not implemented (stub).
 */
async function storeRegenerateHero(prisma, missionId, runInput, run) {
  return { ok: false, error: 'store_regenerate_hero not implemented' };
}

/**
 * store_rebuild_public_preview: not implemented (stub).
 */
async function storeRebuildPublicPreview(prisma, missionId, runInput, run) {
  return { ok: false, error: 'store_rebuild_public_preview not implemented' };
}

const INTERNAL_TOOL_HANDLERS = {
  store_fix_image_mismatch: storeFixImageMismatch,
  store_regenerate_hero: storeRegenerateHero,
  store_rebuild_public_preview: storeRebuildPublicPreview,
};

/**
 * Execute an internal tool by intent. Permission checks are inside each handler.
 * @param {string} missionId
 * @param {string} intent - one of INTERNAL_TOOLS
 * @param {object} runInput - run.input
 * @param {object} run - AgentRun row (for audit metadata)
 * @returns {Promise<{ ok: boolean, summary?: object, error?: string }>}
 */
export async function executeInternalTool(missionId, intent, runInput, run) {
  const prisma = getPrismaClient();
  const handler = INTERNAL_TOOL_HANDLERS[intent];
  if (!handler) {
    return { ok: false, error: `Unknown internal tool: ${intent}` };
  }
  return handler(prisma, missionId, runInput || {}, run || {});
}
