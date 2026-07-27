/**
 * Ops read-only API: status + audit-trail.
 * AuthZ: requireAuth + requireAdmin. No kernel or product flow changes.
 *
 * Example:
 *   curl -H "Authorization: Bearer <admin-token>" "http://localhost:3001/api/ops/status?entityType=DraftStore&entityId=<id>"
 *   curl -H "Authorization: Bearer <admin-token>" "http://localhost:3001/api/ops/audit-trail?entityType=DraftStore&entityId=<id>&limit=50"
 *
 * Manual QA:
 *   - Non-admin → 403
 *   - Admin → 200 with correct data
 *   - Unknown entityId → 404
 */

import { Router } from 'express';
import { getPrismaClient } from '../lib/prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import opsImageRoutes from './opsImageRoutes.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

router.use('/images', opsImageRoutes);

const ALLOWED_STATUS_TYPES = new Set(['DraftStore', 'OrchestratorTask', 'Store', 'Device']);
const ALLOWED_AUDIT_TYPES = new Set(['DraftStore', 'OrchestratorTask', 'CampaignV2']);

function redactRequest(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  if (out.passwordHash || out.token || out.secret) {
    if (out.passwordHash) out.passwordHash = '[REDACTED]';
    if (out.token) out.token = '[REDACTED]';
    if (out.secret) out.secret = '[REDACTED]';
  }
  return out;
}

/**
 * GET /api/ops/status?entityType=DraftStore|OrchestratorTask|Store|Device&entityId=...
 * Returns minimal entity record + status + updatedAt; derived progress when available.
 */
router.get('/status', async (req, res) => {
  try {
    const entityType = (req.query.entityType || '').trim();
    const entityId = (req.query.entityId || '').trim();
    if (!entityType || !entityId) {
      return res.status(400).json({
        ok: false,
        error: 'missing_params',
        message: 'entityType and entityId are required',
      });
    }
    if (!ALLOWED_STATUS_TYPES.has(entityType)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_entity_type',
        message: `entityType must be one of: ${[...ALLOWED_STATUS_TYPES].join(', ')}`,
      });
    }

    const prisma = getPrismaClient();
    let record = null;

    if (entityType === 'DraftStore') {
      record = await prisma.draftStore.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          status: true,
          mode: true,
          generationRunId: true,
          updatedAt: true,
          createdAt: true,
          committedStoreId: true,
          errorCode: true,
        },
      });
      if (record) {
        record.progress = record.status === 'generating' ? 'in_progress' : record.status === 'ready' || record.status === 'committed' ? 'done' : record.status === 'failed' ? 'failed' : null;
      }
    } else if (entityType === 'OrchestratorTask') {
      record = await prisma.orchestratorTask.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          status: true,
          entryPoint: true,
          updatedAt: true,
          createdAt: true,
          request: true,
          result: true,
        },
      });
      if (record) {
        record.request = redactRequest(record.request);
        const r = record.result && typeof record.result === 'object' ? record.result : {};
        record.progress = record.status === 'running' ? (r.progressPct != null ? r.progressPct : 'in_progress') : record.status === 'completed' ? 'done' : record.status === 'failed' ? 'failed' : null;
      }
    } else if (entityType === 'Store') {
      record = await prisma.business.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          updatedAt: true,
          createdAt: true,
          publishedAt: true,
        },
      });
      if (record) record.status = record.isActive ? 'active' : 'inactive';
    } else if (entityType === 'Device') {
      record = await prisma.device.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          status: true,
          tenantId: true,
          storeId: true,
          name: true,
          type: true,
          updatedAt: true,
          createdAt: true,
          lastSeenAt: true,
        },
      });
    }

    if (!record) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: `${entityType} with id ${entityId} not found`,
      });
    }

    return res.json({
      ok: true,
      entityType,
      entityId,
      record,
    });
  } catch (err) {
    console.error('[Ops] GET /status error:', err);
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err?.message || 'Failed to get status',
    });
  }
});

/**
 * GET /api/ops/audit-trail?entityType=DraftStore|OrchestratorTask&entityId=...&limit=50
 * Returns AuditEvent records for the entity, newest first. Kernel already writes these.
 */
router.get('/audit-trail', async (req, res) => {
  try {
    const entityType = (req.query.entityType || '').trim();
    const entityId = (req.query.entityId || '').trim();
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);

    if (!entityType || !entityId) {
      return res.status(400).json({
        ok: false,
        error: 'missing_params',
        message: 'entityType and entityId are required',
      });
    }
    if (!ALLOWED_AUDIT_TYPES.has(entityType)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_entity_type',
        message: `entityType must be one of: ${[...ALLOWED_AUDIT_TYPES].join(', ')}`,
      });
    }

    const prisma = getPrismaClient();
    const events = await prisma.auditEvent.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        fromStatus: true,
        toStatus: true,
        actorType: true,
        actorId: true,
        reason: true,
        correlationId: true,
        metadata: true,
        createdAt: true,
      },
    });

    return res.json({
      ok: true,
      entityType,
      entityId,
      events,
      count: events.length,
    });
  } catch (err) {
    console.error('[Ops] GET /audit-trail error:', err);
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err?.message || 'Failed to get audit trail',
    });
  }
});

export default router;
