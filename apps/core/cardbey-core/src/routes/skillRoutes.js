/**
 * Composable Skills API — registry discovery and governed execution handoff.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import composableSkillRegistry from '../services/skills/skillRegistry.js';
import compositionEngine from '../services/skills/compositionEngine.js';
import { executeComposableSkill } from '../services/skills/index.js';
import { ensureRuntimeAuthorizedContext } from '../lib/runtime/performerRuntime/runtimeOwnership.js';
import { rateLimitMiddleware } from '../services/reliability/rateLimitMiddleware.js';

const router = Router();

router.get('/list', requireAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = String(req.query.category);
    if (req.query.minVersion) filter.minVersion = String(req.query.minVersion);
    if (req.query.tags) {
      filter.tags = String(req.query.tags)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    }

    const skills = composableSkillRegistry.list(filter).map((s) => ({
      id: s.id,
      version: s.version,
      name: s.name,
      description: s.description,
      category: s.category,
      tags: s.tags ?? [],
      capabilities: s.capabilities ?? [],
      inputs: s.inputs ?? [],
      outputs: s.outputs ?? [],
      fallback: s.fallback ?? null,
      timeout: s.timeout ?? null,
    }));

    res.json({ ok: true, skills, count: skills.length });
  } catch (error) {
    console.error('[skills/list]', error);
    res.status(500).json({ ok: false, error: 'skills_list_failed' });
  }
});

router.get('/:skillId', requireAuth, async (req, res) => {
  try {
    const skillId = String(req.params.skillId ?? '').trim();
    const version = req.query.version ? String(req.query.version) : null;
    const skill = version
      ? composableSkillRegistry.getVersion(skillId, version)
      : composableSkillRegistry.get(skillId);

    if (!skill) {
      return res.status(404).json({ ok: false, error: 'skill_not_found' });
    }

    res.json({ ok: true, skill });
  } catch (error) {
    console.error('[skills/get]', error);
    res.status(500).json({ ok: false, error: 'skill_get_failed' });
  }
});

router.post(
  '/execute',
  requireAuth,
  rateLimitMiddleware({
    endpoint: '/api/skills/execute',
    windowMs: 60_000,
    maxRequests: 30,
    perUser: true,
  }),
  async (req, res) => {
    try {
      const skillId = String(req.body?.skillId ?? req.body?.id ?? '').trim();
      if (!skillId) {
        return res.status(400).json({ ok: false, error: 'skill_id_required' });
      }

      const context = ensureRuntimeAuthorizedContext(
        req.body?.context && typeof req.body.context === 'object' && !Array.isArray(req.body.context)
          ? {
              ...req.body.context,
              userId: req.body.context.userId ?? req.user?.id ?? null,
            }
          : { userId: req.user?.id ?? null },
        null,
        'skill_route_execute',
      );

      const result = await executeComposableSkill(skillId, context, {
        version: req.body?.version,
        composition: req.body?.composition,
        skills: req.body?.skills,
        timeout: req.body?.timeout,
        fallback: req.body?.fallback,
      });

      res.json({ ok: true, result });
    } catch (error) {
      console.error('[skills/execute]', error);
      res.status(500).json({ ok: false, error: error?.message || 'skill_execute_failed' });
    }
  },
);

router.post('/compose', requireAuth, async (req, res) => {
  try {
    const mode = String(req.body?.mode ?? 'sequence').trim();
    const skills = Array.isArray(req.body?.skills) ? req.body.skills : [];
    const context = ensureRuntimeAuthorizedContext(
      req.body?.context && typeof req.body.context === 'object' && !Array.isArray(req.body.context)
        ? {
            ...req.body.context,
            userId: req.body.context.userId ?? req.user?.id ?? null,
          }
        : { userId: req.user?.id ?? null },
      null,
      'skill_route_compose',
    );

    if (!skills.length) {
      return res.status(400).json({ ok: false, error: 'skills_array_required' });
    }

    let result;
    if (mode === 'parallel') {
      result = await compositionEngine.parallel(skills, context);
    } else if (mode === 'condition') {
      result = await compositionEngine.condition(
        req.body?.condition ?? false,
        skills[0],
        skills[1] ?? null,
        context,
      );
    } else {
      result = await compositionEngine.sequence(skills, context);
    }

    res.json({ ok: true, result });
  } catch (error) {
    console.error('[skills/compose]', error);
    res.status(500).json({ ok: false, error: error?.message || 'skill_compose_failed' });
  }
});

export default router;
