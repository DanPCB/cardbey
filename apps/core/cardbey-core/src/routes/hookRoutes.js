/**
 * Hook Routes — manage and test lifecycle hooks (admin).
 */

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import hookRegistry, { HOOK_TYPES } from '../services/hooks/hookRegistry.js';
import hookExecutor from '../services/hooks/hookExecutor.js';
import { getSkillMetrics } from '../services/hooks/hookMetrics.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/', async (_req, res) => {
  try {
    res.json({ ok: true, hooks: hookRegistry.list(), count: hookRegistry.hooks.size });
  } catch (error) {
    console.error('[hooks/list]', error);
    res.status(500).json({ ok: false, error: 'hooks_list_failed' });
  }
});

router.get('/types', async (_req, res) => {
  res.json({ ok: true, types: Object.values(HOOK_TYPES) });
});

router.get('/metrics', async (req, res) => {
  const skillId = String(req.query.skillId ?? '').trim();
  const userId = String(req.query.userId ?? req.user?.id ?? 'anonymous').trim();
  if (!skillId) {
    return res.status(400).json({ ok: false, error: 'skill_id_required' });
  }
  res.json({ ok: true, metrics: getSkillMetrics(skillId, userId) });
});

router.get('/by-type/:type', async (req, res) => {
  try {
    const type = String(req.params.type ?? '').trim();
    const skillId = req.query.skillId ? String(req.query.skillId) : null;
    const hooks = hookRegistry.getByType(type, skillId).map((h) => h.toJSON());
    res.json({ ok: true, hooks, count: hooks.length });
  } catch (error) {
    console.error('[hooks/by-type]', error);
    res.status(500).json({ ok: false, error: 'hooks_get_failed' });
  }
});

router.delete('/item/:id', async (req, res) => {
  try {
    const removed = hookRegistry.unregister(String(req.params.id ?? '').trim());
    res.json({ ok: true, removed });
  } catch (error) {
    console.error('[hooks/delete]', error);
    res.status(500).json({ ok: false, error: 'hooks_delete_failed' });
  }
});

router.post('/test', async (req, res) => {
  try {
    const skillId = String(req.body?.skillId ?? 'analyze_store').trim();
    const context =
      req.body?.context && typeof req.body.context === 'object' && !Array.isArray(req.body.context)
        ? req.body.context
        : {};

    const phase = String(req.body?.phase ?? 'pre').trim();
    let results;

    if (phase === 'post') {
      results = await hookExecutor.executePostHooks(skillId, context, req.body?.result ?? { ok: true });
    } else if (phase === 'error') {
      results = await hookExecutor.executeErrorHooks(
        skillId,
        context,
        new Error(String(req.body?.error ?? 'test_error')),
      );
    } else {
      results = await hookExecutor.executePreHooks(skillId, {
        userId: req.user?.id ?? context.userId ?? null,
        ...context,
      });
    }

    res.json({ ok: true, results });
  } catch (error) {
    console.error('[hooks/test]', error);
    res.status(500).json({ ok: false, error: error?.message || 'hooks_test_failed' });
  }
});

router.get('/metrics/:skillId', async (req, res) => {
  const skillId = String(req.params.skillId ?? '').trim();
  const userId = String(req.query.userId ?? req.user?.id ?? 'anonymous').trim();
  res.json({ ok: true, metrics: getSkillMetrics(skillId, userId) });
});

export default router;
