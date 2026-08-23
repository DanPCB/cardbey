/**
 * Platform admin account management — duplicate stores & suspicious accounts.
 *
 * GET  /api/admin/platform/account-management/duplicate-stores
 * GET  /api/admin/platform/account-management/suspicious-accounts
 * DELETE /api/admin/platform/account-management/stores/:storeId  { confirmed: true }
 * DELETE /api/admin/platform/account-management/users/:userId    { confirmed: true }
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { getPrismaClient } from '../../lib/prisma.js';
import {
  adminDeleteStore,
  adminDeleteUser,
  listDuplicateStoreGroups,
  listSuspiciousAccounts,
} from '../../lib/admin/accountManagementService.js';
import { resolveWebsiteEditingContext } from '../../services/websiteEditing/resolveWebsiteEditingContext.js';
import { buildDesignPresentationProjection } from '../../services/websiteEditing/buildDesignPresentationProjection.js';
import { DESIGN_READINESS } from '../../services/websiteEditing/designAdapterContract.js';
import Features from '../../config/features.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

/**
 * GET /api/admin/platform/account-management/stores/:storeId/website-editing-context
 * Same canonical resolver as owner Website Editing (admin-support entry).
 * Read-only — does not create Business or mutate live content.
 */
router.get(
  '/platform/account-management/stores/:storeId/website-editing-context',
  async (req, res, next) => {
    try {
      const storeId = String(req.params.storeId ?? '').trim();
      if (!storeId) {
        return res.status(400).json({ ok: false, error: 'storeId_required' });
      }
      const draftId =
        typeof req.query.draftId === 'string' && req.query.draftId.trim()
          ? req.query.draftId.trim()
          : null;
      const revisionId =
        typeof req.query.revisionId === 'string' && req.query.revisionId.trim()
          ? req.query.revisionId.trim()
          : null;

      const prisma = getPrismaClient();
      const context = await resolveWebsiteEditingContext(prisma, {
        storeId,
        draftId,
        revisionId,
        userId: req.userId,
        user: req.user,
        adminSupport: true,
      });
      return res.status(200).json(context);
    } catch (err) {
      const status = err?.statusCode || 500;
      if (status !== 500) {
        return res.status(status).json({
          ok: false,
          error: err.code || 'resolve_failed',
          message: err.message || 'Could not resolve Website Editing context',
        });
      }
      return next(err);
    }
  },
);

/**
 * GET /api/admin/platform/account-management/stores/:storeId/website-editing/design-projection
 * C1 read-only Design projection (admin-support). Same flag + allowInit:false as owner.
 */
router.get(
  '/platform/account-management/stores/:storeId/website-editing/design-projection',
  async (req, res, next) => {
    try {
      const storeId = String(req.params.storeId ?? '').trim();
      if (!storeId) {
        return res.status(400).json({ ok: false, error: 'storeId_required' });
      }
      const flagEnabled = Boolean(Features.websiteEditingDesignAdapter?.v1);
      if (!flagEnabled) {
        return res.status(200).json({
          ok: true,
          readiness: DESIGN_READINESS.NOT_ENABLED,
          message: 'Website Editing Design adapter is not enabled.',
          projection: null,
        });
      }
      const draftId =
        typeof req.query.draftId === 'string' && req.query.draftId.trim()
          ? req.query.draftId.trim()
          : null;

      const prisma = getPrismaClient();
      let editingContext = null;
      try {
        editingContext = await resolveWebsiteEditingContext(prisma, {
          storeId,
          draftId,
          userId: req.userId,
          user: req.user,
          adminSupport: true,
          allowInit: false,
        });
      } catch (err) {
        const status = err?.statusCode || 500;
        if (status === 403 || status === 404) {
          return res.status(status).json({
            ok: false,
            error: err.code || 'forbidden',
            message: err.message || 'Not allowed',
            readiness: DESIGN_READINESS.BLOCKED_BY_MISSING_DRAFT,
          });
        }
        if (status === 500) return next(err);
        editingContext = null;
      }

      const business = await prisma.business.findUnique({ where: { id: storeId } });
      if (!business) {
        return res.status(404).json({ ok: false, error: 'store_not_found' });
      }
      const resolvedDraftId = editingContext?.draftId || draftId;
      let draft = null;
      if (resolvedDraftId) {
        draft = await prisma.draftStore.findUnique({ where: { id: resolvedDraftId } }).catch(() => null);
      }
      const body = buildDesignPresentationProjection({
        business,
        draft,
        editingContext,
        flagEnabled: true,
      });
      return res.status(200).json({ ...body, adminSupport: true });
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * C2 admin setTemplate (requires reason).
 * POST .../website-editing/design/template  { presetId, reason, expectedFingerprint? }
 */
router.post(
  '/platform/account-management/stores/:storeId/website-editing/design/template',
  async (req, res, next) => {
    try {
      const storeId = String(req.params.storeId ?? '').trim();
      if (!storeId) return res.status(400).json({ ok: false, error: 'storeId_required' });
      const reason = String(req.body?.reason || req.body?.adminReason || '').trim();
      if (!reason) {
        return res.status(400).json({ ok: false, error: 'admin_reason_required' });
      }
      const { executeSetTemplate } = await import(
        '../../services/websiteEditing/designAdapterMutations.js'
      );
      const prisma = getPrismaClient();
      const result = await executeSetTemplate(prisma, {
        storeId,
        userId: req.userId,
        user: req.user,
        draftId: req.body?.draftId || null,
        presetId: req.body?.presetId || req.body?.templateId,
        expectedFingerprint: req.body?.expectedFingerprint,
        body: req.body,
        adminSupport: true,
        adminReason: reason,
      });
      return res.status(200).json({ ...result, adminSupport: true });
    } catch (err) {
      const status = err?.statusCode || 500;
      if (status !== 500) {
        return res.status(status).json({
          ok: false,
          error: err.code || 'set_template_failed',
          message: err.message,
          currentFingerprint: err.currentFingerprint,
        });
      }
      return next(err);
    }
  },
);

function requireConfirmed(req, res) {
  if (req.body?.confirmed !== true) {
    res.status(400).json({
      ok: false,
      error: 'confirmation_required',
      message: 'Set confirmed: true in request body to proceed with deletion.',
    });
    return false;
  }
  return true;
}

router.get('/platform/account-management/duplicate-stores', async (_req, res, next) => {
  try {
    const prisma = getPrismaClient();
    const payload = await listDuplicateStoreGroups(prisma);
    return res.json({ ok: true, ...payload });
  } catch (err) {
    return next(err);
  }
});

router.get('/platform/account-management/suspicious-accounts', async (_req, res, next) => {
  try {
    const prisma = getPrismaClient();
    const payload = await listSuspiciousAccounts(prisma);
    return res.json({ ok: true, ...payload });
  } catch (err) {
    return next(err);
  }
});

router.delete('/platform/account-management/stores/:storeId', async (req, res, next) => {
  try {
    if (!requireConfirmed(req, res)) return;

    const storeId = String(req.params.storeId ?? '').trim();
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'storeId_required' });
    }

    const prisma = getPrismaClient();
    const deleted = await adminDeleteStore(prisma, storeId, {
      actorUserId: req.userId ?? null,
      reason: req.body?.reason,
    });

    return res.json({ ok: true, deleted: deleted.id, name: deleted.name, slug: deleted.slug });
  } catch (err) {
    if (err?.status === 404) {
      return res.status(404).json({ ok: false, error: err.code ?? 'not_found', message: err.message });
    }
    if (err?.status === 500 || err?.code === 'store_delete_failed') {
      return res.status(500).json({
        ok: false,
        error: err.code ?? 'store_delete_failed',
        message: err.message ?? 'Could not delete store',
      });
    }
    return next(err);
  }
});

router.delete('/platform/account-management/users/:userId', async (req, res, next) => {
  try {
    if (!requireConfirmed(req, res)) return;

    const userId = String(req.params.userId ?? '').trim();
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'userId_required' });
    }

    const prisma = getPrismaClient();
    const deleted = await adminDeleteUser(prisma, userId, { actorUserId: req.userId ?? null });

    console.log('[admin/account-management] user deleted', {
      userId: deleted.id,
      email: deleted.email,
      deletedStoreCount: deleted.deletedStoreCount,
      actorUserId: req.userId ?? null,
      timestamp: new Date().toISOString(),
    });

    return res.json({ ok: true, deleted: deleted.id, email: deleted.email, deletedStoreCount: deleted.deletedStoreCount });
  } catch (err) {
    if (err?.status === 404) {
      return res.status(404).json({ ok: false, error: err.code ?? 'not_found', message: err.message });
    }
    if (err?.status === 403) {
      return res.status(403).json({ ok: false, error: err.code ?? 'forbidden', message: err.message });
    }
    return next(err);
  }
});

export default router;
