/**
 * Ops image API: detect-mismatch (read-only) and rebind-by-stable-key.
 * AuthZ: requireAuth + requireAdmin. Rebind applies only when OPS_IMAGE_REBIND_ENABLED=true.
 * Risk: Only updates draft.preview (item imageUrl); no status change, no kernel bypass.
 *
 * Manual QA:
 *   - detect-mismatch on draft with wrong/missing images => non-empty mismatches
 *   - rebind dryRun=true => proposed changes
 *   - rebind dryRun=false with flag => apply + AuditEvent; detect-mismatch after => empty
 */

import { Router } from 'express';
import { getPrismaClient } from '../lib/prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { detectMismatchesDraftStore, rebindDraftStoreByStableKey } from '../services/ops/opsImageService.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

const REBIND_ENABLED = process.env.OPS_IMAGE_REBIND_ENABLED === 'true' || process.env.OPS_IMAGE_REBIND_ENABLED === '1';

/**
 * POST /api/ops/images/detect-mismatch
 * Body: { entityType: "DraftStore" | "Store", entityId: string }
 * Returns: { mismatches: Array<{ itemStableKey, expectedImageKey?, actualImageKey?, reason, evidence }> }
 */
router.post('/detect-mismatch', async (req, res) => {
  try {
    const { entityType, entityId } = req.body || {};
    if (!entityType || !entityId) {
      return res.status(400).json({
        ok: false,
        error: 'missing_params',
        message: 'entityType and entityId are required in body',
      });
    }
    if (entityType !== 'DraftStore' && entityType !== 'Store') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_entity_type',
        message: 'entityType must be DraftStore or Store',
      });
    }

    const prisma = getPrismaClient();

    if (entityType === 'DraftStore') {
      const draft = await prisma.draftStore.findUnique({
        where: { id: entityId },
        select: { id: true, preview: true },
      });
      if (!draft) {
        return res.status(404).json({
          ok: false,
          error: 'not_found',
          message: `DraftStore ${entityId} not found`,
        });
      }
      const { mismatches } = detectMismatchesDraftStore(draft);
      return res.json({ ok: true, mismatches, entityType, entityId });
    }

    // Store (Business): products have imageUrl; no stable-key mapping in core today — return empty or minimal
    if (entityType === 'Store') {
      const business = await prisma.business.findUnique({
        where: { id: entityId },
        select: { id: true },
      });
      if (!business) {
        return res.status(404).json({
          ok: false,
          error: 'not_found',
          message: `Store ${entityId} not found`,
        });
      }
      return res.json({ ok: true, mismatches: [], entityType, entityId });
    }

    return res.status(400).json({ ok: false, error: 'invalid_entity_type' });
  } catch (err) {
    console.error('[Ops] POST /images/detect-mismatch error:', err);
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err?.message || 'Failed to detect mismatch',
    });
  }
});

/**
 * POST /api/ops/images/rebind-by-stable-key
 * Body: { entityType: "DraftStore" | "Store", entityId: string, dryRun: boolean }
 * Returns: { changes: Array<{ itemStableKey, from, to }>, applied: boolean }
 * When applied: creates AuditEvent (ops_rebind_by_stable_key). Only runs if OPS_IMAGE_REBIND_ENABLED.
 */
router.post('/rebind-by-stable-key', async (req, res) => {
  try {
    const { entityType, entityId, dryRun } = req.body || {};
    if (!entityType || !entityId) {
      return res.status(400).json({
        ok: false,
        error: 'missing_params',
        message: 'entityType and entityId are required in body',
      });
    }
    if (entityType !== 'DraftStore' && entityType !== 'Store') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_entity_type',
        message: 'entityType must be DraftStore or Store',
      });
    }

    const prisma = getPrismaClient();

    if (entityType === 'DraftStore') {
      const draft = await prisma.draftStore.findUnique({
        where: { id: entityId },
        select: { id: true, preview: true, status: true },
      });
      if (!draft) {
        return res.status(404).json({
          ok: false,
          error: 'not_found',
          message: `DraftStore ${entityId} not found`,
        });
      }

      const isDryRun = dryRun === true || dryRun === 'true';
      const result = rebindDraftStoreByStableKey(draft, isDryRun);

      if (!isDryRun && result.applied && result.newPreview) {
        if (!REBIND_ENABLED) {
          return res.status(403).json({
            ok: false,
            error: 'rebind_disabled',
            message: 'Set OPS_IMAGE_REBIND_ENABLED=true to allow apply. Use dryRun: true to see proposed changes.',
            changes: result.changes,
            applied: false,
          });
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
            actorId: req.user?.id || null,
            reason: 'ops_rebind_by_stable_key',
            metadata: { changeCount: result.changes.length, diffSummary },
          },
        });
      }

      return res.json({
        ok: true,
        changes: result.changes,
        applied: result.applied,
        entityType,
        entityId,
      });
    }

    if (entityType === 'Store') {
      return res.json({
        ok: true,
        changes: [],
        applied: false,
        entityType,
        entityId,
        message: 'Store rebind not implemented; use DraftStore.',
      });
    }

    return res.status(400).json({ ok: false, error: 'invalid_entity_type' });
  } catch (err) {
    console.error('[Ops] POST /images/rebind-by-stable-key error:', err);
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err?.message || 'Failed to rebind',
    });
  }
});

export default router;
