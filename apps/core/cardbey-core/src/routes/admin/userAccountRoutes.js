/**
 * Admin User Accounts API — governed writes via Runtime Authority.
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { dispatchTool } from '../../lib/toolDispatcher.js';
import { markRuntimeOwnedContext } from '../../lib/runtime/performerRuntime/runtimeOwnership.js';
import {
  getUserAccountDetail,
  listUserAccounts,
} from '../../lib/account/userAccountAdminService.js';
import { listUserAccountEvents } from '../../lib/account/userAccountEventService.js';
import { getAccountProfileForUser } from '../../lib/account/accountProfileService.js';

const router = Router();

function buildAdminContext(req) {
  return markRuntimeOwnedContext(
    {
      userId: req.userId ?? null,
      role: req.user?.role ?? 'platform_admin',
      source: 'user_account_admin',
      route: req.originalUrl,
      runtimeExecutionId: req.headers['x-cardbey-trace-id'] ?? `user-admin-${Date.now()}`,
    },
    req.headers['x-cardbey-trace-id'] ?? 'user-account-admin',
  );
}

async function dispatchAdminTool(req, res, toolName, input) {
  const result = await dispatchTool(toolName, input, buildAdminContext(req));
  const statusCode = result.status === 'ok' ? 200 : result.status === 'blocked' ? 403 : 422;
  return res.status(statusCode).json({
    ok: result.status === 'ok',
    status: result.status,
    toolName,
    output: result.output ?? null,
    error: result.error ?? null,
  });
}

router.get('/user-accounts', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await listUserAccounts({
      q: req.query.q,
      status: req.query.status,
      capability: req.query.capability,
      limit: Number(req.query.limit) || 30,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return next(err);
  }
});

router.get('/user-accounts/:userId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const detail = await getUserAccountDetail(String(req.params.userId));
    if (!detail) return res.status(404).json({ ok: false, error: 'user_not_found' });
    return res.json({ ok: true, ...detail });
  } catch (err) {
    return next(err);
  }
});

router.get('/user-accounts/:userId/events', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const events = await listUserAccountEvents(String(req.params.userId));
    return res.json({ ok: true, events });
  } catch (err) {
    return next(err);
  }
});

router.post('/user-accounts/:userId/status', requireAuth, requireAdmin, async (req, res) => {
  const userId = String(req.params.userId);
  return dispatchAdminTool(req, res, 'update_user_account_status', {
    userId,
    status: req.body?.status,
    reasonCode: req.body?.reasonCode,
    internalNote: req.body?.internalNote,
    publicReason: req.body?.publicReason,
  });
});

router.post('/user-accounts/:userId/capabilities', requireAuth, requireAdmin, async (req, res) => {
  const userId = String(req.params.userId);
  return dispatchAdminTool(req, res, 'manage_user_capability', { userId, ...req.body });
});

router.post('/user-accounts/:userId/notes', requireAuth, requireAdmin, async (req, res) => {
  const userId = String(req.params.userId);
  return dispatchAdminTool(req, res, 'add_user_account_note', {
    userId,
    note: req.body?.note,
    internalNote: req.body?.internalNote,
  });
});

router.post('/user-accounts/:userId/restrict-creator', requireAuth, requireAdmin, async (req, res) => {
  const userId = String(req.params.userId);
  return dispatchAdminTool(req, res, 'restrict_creator_capability', { userId, ...req.body });
});

router.post('/user-accounts/:userId/restore-creator', requireAuth, requireAdmin, async (req, res) => {
  const userId = String(req.params.userId);
  return dispatchAdminTool(req, res, 'restore_creator_capability', { userId, ...req.body });
});

/** Authenticated user's canonical account profile */
router.get('/account/profile', requireAuth, async (req, res, next) => {
  try {
    const profile = await getAccountProfileForUser(req.userId);
    if (!profile) return res.status(404).json({ ok: false, error: 'profile_not_found' });
    return res.json({ ok: true, profile });
  } catch (err) {
    return next(err);
  }
});

export default router;
