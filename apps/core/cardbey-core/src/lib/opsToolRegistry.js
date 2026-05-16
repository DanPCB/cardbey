/**
 * Ops tool allow-list for agent: 1:1 mapping to /api/ops capabilities.
 * Tools run in-process with userId; admin check before any call. No HTTP; internal prisma + opsImageService.
 * Log: [AgentOps] tool= entity= ok= ms= correlationId= (no full payloads).
 */

import { getPrismaClient } from '../lib/prisma.js';
import { detectMismatchesDraftStore, rebindDraftStoreByStableKey } from '../services/ops/opsImageService.js';

export const OPS_TOOL_NAMES = new Set([
  'ops.getStatus',
  'ops.getAuditTrail',
  'images.detectMismatch',
  'images.rebindByStableKey',
]);

const MAX_REBIND_CHANGES = 200;

/**
 * Check if user is platform admin (role === 'admin'). Non-fatal on DB error.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function isUserAdmin(userId) {
  if (!userId) return false;
  const prisma = getPrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    return user?.role === 'admin';
  } catch {
    return false;
  }
}

function logOpsTool(tool, entity, ok, ms, correlationId, extra = {}) {
  const parts = ['[AgentOps]', `tool=${tool}`, `entity=${entity}`, `ok=${ok}`, `ms=${ms}`, `correlationId=${correlationId || ''}`];
  if (extra.count != null) parts.push(`count=${extra.count}`);
  console.log(parts.join(' '));
}

/**
 * Execute an ops tool. Only allow-listed tools; requires admin user.
 * @param {string} toolName - One of OPS_TOOL_NAMES
 * @param {object} params - Tool params (entityType, entityId, limit, dryRun)
 * @param {{ missionId: string, runId: string, userId: string }} ctx
 * @returns {Promise<{ ok: boolean, data?: object, error?: string }>}
 */
export async function executeOpsTool(toolName, params, ctx) {
  const start = Date.now();
  const correlationId = [ctx.missionId, ctx.runId].filter(Boolean).join(':');
  const entity = params?.entityType && params?.entityId ? `${params.entityType}:${params.entityId}` : '';

  if (!OPS_TOOL_NAMES.has(toolName)) {
    logOpsTool(toolName, entity, false, Date.now() - start, correlationId);
    return { ok: false, error: `Unknown ops tool: ${toolName}` };
  }

  const admin = await isUserAdmin(ctx.userId);
  if (!admin) {
    logOpsTool(toolName, entity, false, Date.now() - start, correlationId);
    return { ok: false, error: 'Permission denied: platform admin required for ops tools' };
  }

  const prisma = getPrismaClient();
  try {
    let data;
    if (toolName === 'ops.getStatus') {
      const { entityType, entityId } = params || {};
      if (!entityType || !entityId) {
        logOpsTool(toolName, entity, false, Date.now() - start, correlationId);
        return { ok: false, error: 'entityType and entityId required' };
      }
      const allowed = ['DraftStore', 'OrchestratorTask', 'Store', 'Device'].includes(entityType);
      if (!allowed) {
        logOpsTool(toolName, entity, false, Date.now() - start, correlationId);
        return { ok: false, error: 'invalid_entity_type' };
      }
      if (entityType === 'DraftStore') {
        const row = await prisma.draftStore.findUnique({
          where: { id: entityId },
          select: { id: true, status: true, updatedAt: true, createdAt: true },
        });
        data = row ? { record: row } : null;
      } else if (entityType === 'OrchestratorTask') {
        const row = await prisma.orchestratorTask.findUnique({
          where: { id: entityId },
          select: { id: true, status: true, updatedAt: true, createdAt: true },
        });
        data = row ? { record: row } : null;
      } else if (entityType === 'Store') {
        const row = await prisma.business.findUnique({
          where: { id: entityId },
          select: { id: true, name: true, isActive: true, updatedAt: true },
        });
        data = row ? { record: { ...row, status: row.isActive ? 'active' : 'inactive' } } : null;
      } else if (entityType === 'Device') {
        const row = await prisma.device.findUnique({
          where: { id: entityId },
          select: { id: true, status: true, updatedAt: true },
        });
        data = row ? { record: row } : null;
      }
      if (!data) {
        logOpsTool(toolName, entity, false, Date.now() - start, correlationId);
        return { ok: false, error: 'not_found' };
      }
      logOpsTool(toolName, entity, true, Date.now() - start, correlationId);
      return { ok: true, data };
    } else if (toolName === 'ops.getAuditTrail') {
      const { entityType, entityId, limit: rawLimit } = params || {};
      if (!entityType || !entityId) {
        logOpsTool(toolName, entity, false, Date.now() - start, correlationId);
        return { ok: false, error: 'entityType and entityId required' };
      }
      const limit = Math.min(parseInt(rawLimit || 50, 10) || 50, 200);
      const events = await prisma.auditEvent.findMany({
        where: { entityType, entityId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, action: true, fromStatus: true, toStatus: true,
          actorType: true, actorId: true, reason: true, correlationId: true, metadata: true, createdAt: true,
        },
      });
      data = { events, count: events.length };
      logOpsTool(toolName, entity, true, Date.now() - start, correlationId, { count: events.length });
      return { ok: true, data };
    } else if (toolName === 'images.detectMismatch') {
      const { entityType, entityId } = params || {};
      if (!entityType || !entityId) {
        logOpsTool(toolName, entity, false, Date.now() - start, correlationId);
        return { ok: false, error: 'entityType and entityId required' };
      }
      if (entityType !== 'DraftStore' && entityType !== 'Store') {
        logOpsTool(toolName, entity, false, Date.now() - start, correlationId);
        return { ok: false, error: 'invalid_entity_type' };
      }
      if (entityType === 'DraftStore') {
        const draft = await prisma.draftStore.findUnique({
          where: { id: entityId },
          select: { id: true, preview: true },
        });
        if (!draft) {
          logOpsTool(toolName, entity, false, Date.now() - start, correlationId);
          return { ok: false, error: 'not_found' };
        }
        const { mismatches } = detectMismatchesDraftStore(draft);
        data = { mismatches };
        logOpsTool(toolName, entity, true, Date.now() - start, correlationId, { count: mismatches.length });
        return { ok: true, data };
      }
      data = { mismatches: [] };
      logOpsTool(toolName, entity, true, Date.now() - start, correlationId, { count: 0 });
      return { ok: true, data };
    } else if (toolName === 'images.rebindByStableKey') {
      const { entityType, entityId, dryRun } = params || {};
      if (!entityType || !entityId) {
        logOpsTool(toolName, entity, false, Date.now() - start, correlationId);
        return { ok: false, error: 'entityType and entityId required' };
      }
      if (entityType !== 'DraftStore' && entityType !== 'Store') {
        logOpsTool(toolName, entity, false, Date.now() - start, correlationId);
        return { ok: false, error: 'invalid_entity_type' };
      }
      if (entityType === 'Store') {
        logOpsTool(toolName, entity, true, Date.now() - start, correlationId, { count: 0 });
        return { ok: true, data: { changes: [], applied: false, message: 'Store rebind not implemented; use DraftStore.' } };
      }
      const draft = await prisma.draftStore.findUnique({
        where: { id: entityId },
        select: { id: true, preview: true, status: true },
      });
      if (!draft) {
        logOpsTool(toolName, entity, false, Date.now() - start, correlationId);
        return { ok: false, error: 'not_found' };
      }
      const isDryRun = dryRun === true || dryRun === 'true';
      const result = rebindDraftStoreByStableKey(draft, isDryRun);
      if (!isDryRun && result.applied && result.newPreview && result.changes.length > 0) {
        const rebindEnabled = process.env.OPS_IMAGE_REBIND_ENABLED === 'true' || process.env.OPS_IMAGE_REBIND_ENABLED === '1';
        if (!rebindEnabled) {
          logOpsTool(toolName, entity, true, Date.now() - start, correlationId, { count: result.changes.length });
          return { ok: true, data: { ...result, applied: false, message: 'OPS_IMAGE_REBIND_ENABLED not set' } };
        }
        if (result.changes.length > MAX_REBIND_CHANGES) {
          logOpsTool(toolName, entity, false, Date.now() - start, correlationId, { count: result.changes.length });
          return { ok: false, error: `Too many changes (${result.changes.length}); max ${MAX_REBIND_CHANGES}. Confirm or narrow scope.` };
        }
        await prisma.draftStore.update({
          where: { id: entityId },
          data: { preview: result.newPreview, updatedAt: new Date() },
        });
        const diffSummary = result.changes.length <= 5
          ? result.changes
          : result.changes.slice(0, 5).concat([{ itemStableKey: '...', count: result.changes.length }]);
        await prisma.auditEvent.create({
          data: {
            entityType: 'DraftStore',
            entityId,
            action: 'ops_rebind_by_stable_key',
            fromStatus: null,
            toStatus: null,
            actorType: 'human',
            actorId: ctx.userId,
            reason: 'ops_rebind_by_stable_key',
            metadata: { changeCount: result.changes.length, diffSummary },
          },
        });
      }
      logOpsTool(toolName, entity, true, Date.now() - start, correlationId, { count: result.changes.length });
      return { ok: true, data: { changes: result.changes, applied: result.applied } };
    }

    logOpsTool(toolName, entity, true, Date.now() - start, correlationId);
    return { ok: true, data: data || {} };
  } catch (err) {
    logOpsTool(toolName, entity, false, Date.now() - start, correlationId);
    return { ok: false, error: err?.message || String(err) };
  }
}

export { MAX_REBIND_CHANGES };
