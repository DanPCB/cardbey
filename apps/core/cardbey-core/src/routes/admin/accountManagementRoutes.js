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
    const deleted = await adminDeleteStore(prisma, storeId);

    console.log('[admin/account-management] store deleted', {
      storeId: deleted.id,
      slug: deleted.slug,
      actorUserId: req.userId ?? null,
      timestamp: new Date().toISOString(),
    });

    return res.json({ ok: true, deleted: deleted.id, name: deleted.name, slug: deleted.slug });
  } catch (err) {
    if (err?.status === 404) {
      return res.status(404).json({ ok: false, error: err.code ?? 'not_found', message: err.message });
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
