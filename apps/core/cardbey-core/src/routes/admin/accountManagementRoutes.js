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

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

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
