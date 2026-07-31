/**
 * Template Library Platform REST routes.
 * Reads: direct service calls. Mutations: Runtime Authority only.
 */

import express from 'express';
import { z } from 'zod';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { assertUiWriteAuthority } from '../lib/runtime/performerRuntime/uiWriteAuthorityGuard.js';
import { executeTemplateRuntimeAction } from '../lib/templateLibrary/templateRuntimeService.js';
import {
  listTemplateLibraries,
  searchTemplates,
  getTemplateDetails,
  getTemplateVersion,
  previewTemplate,
} from '../lib/templateLibrary/templateLibraryService.js';
import { getTemplateInstance } from '../lib/templateLibrary/templateInstanceService.js';
import { resolveTemplateActor } from '../lib/templateLibrary/templateLibraryHelpers.js';
import { isTemplateFeatureEnabled, TEMPLATE_FEATURE_FLAGS } from '../lib/templateLibrary/templateFeatureFlags.js';
import { recordRuntimeAuthorityPathUsed } from '../lib/runtime/performerRuntime/runtimeAuthorityGuard.js';

const router = express.Router();

function featureGate(_req, res, next) {
  if (!isTemplateFeatureEnabled(TEMPLATE_FEATURE_FLAGS.ENABLE_TEMPLATE_LIBRARY)) {
    return res.status(503).json({ ok: false, error: 'feature_disabled', flag: 'ENABLE_TEMPLATE_LIBRARY' });
  }
  next();
}

const searchSchema = z.object({
  keyword: z.string().optional(),
  contentType: z.string().optional(),
  industry: z.string().optional(),
  useCase: z.string().optional(),
  channel: z.string().optional(),
  variant: z.string().optional(),
  sort: z.enum(['recent', 'popular', 'recommended']).optional(),
  recommended: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  season: z.string().optional(),
});

/** GET /api/template-libraries */
router.get('/template-libraries', optionalAuth, featureGate, async (req, res) => {
  try {
    const actor = await resolveTemplateActor(req);
    const result = await listTemplateLibraries({
      actor,
      filters: {
        ownerType: req.query.ownerType,
        category: req.query.category,
        status: req.query.status,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      },
    });
    if (!result.ok) return res.status(result.error === 'feature_disabled' ? 503 : 500).json(result);
    res.json({ ok: true, libraries: result.libraries });
  } catch (err) {
    console.error('[template-libraries] list error', err);
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

/** GET /api/templates */
router.get('/templates', optionalAuth, featureGate, async (req, res) => {
  try {
    const actor = await resolveTemplateActor(req);
    const result = await searchTemplates({
      actor,
      query: {
        keyword: req.query.keyword,
        contentType: req.query.contentType,
        industry: req.query.industry,
        useCase: req.query.useCase,
        channel: req.query.channel,
        sort: req.query.sort,
        recommended: req.query.recommended === 'true',
        limit: req.query.limit ? Number(req.query.limit) : 24,
        offset: req.query.offset ? Number(req.query.offset) : 0,
      },
    });
    if (!result.ok) return res.status(result.error === 'feature_disabled' ? 503 : 500).json(result);
    res.json(result);
  } catch (err) {
    console.error('[templates] search error', err);
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

/** POST /api/templates/search */
router.post('/templates/search', optionalAuth, featureGate, async (req, res) => {
  try {
    const parsed = searchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_error', details: parsed.error.flatten() });
    }
    const actor = await resolveTemplateActor(req);
    const result = await searchTemplates({
      actor,
      query: {
        ...parsed.data,
        recommended: parsed.data.sort === 'recommended' || parsed.data.recommended,
      },
    });
    if (!result.ok) return res.status(result.error === 'feature_disabled' ? 503 : 500).json(result);
    res.json(result);
  } catch (err) {
    console.error('[templates] POST search error', err);
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

/** GET /api/templates/:templateId */
router.get('/templates/:templateId', optionalAuth, featureGate, async (req, res) => {
  try {
    const actor = await resolveTemplateActor(req);
    const result = await getTemplateDetails({ actor, templateId: req.params.templateId });
    if (!result.ok) {
      const status = result.error === 'not_found' ? 404 : result.error === 'forbidden' ? 403 : 500;
      return res.status(status).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

/** GET /api/templates/:templateId/versions/:versionId */
router.get('/templates/:templateId/versions/:versionId', optionalAuth, featureGate, async (req, res) => {
  try {
    const actor = await resolveTemplateActor(req);
    const result = await getTemplateVersion({
      actor,
      templateId: req.params.templateId,
      versionId: req.params.versionId,
    });
    if (!result.ok) {
      const status =
        result.error === 'not_found' || result.error === 'version_not_found'
          ? 404
          : result.error === 'forbidden'
            ? 403
            : 500;
      return res.status(status).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

/** POST /api/templates/:templateId/preview */
router.post('/templates/:templateId/preview', optionalAuth, featureGate, async (req, res) => {
  try {
    const actor = await resolveTemplateActor(req);
    const result = await previewTemplate({
      actor,
      templateId: req.params.templateId,
      versionId: req.body?.versionId,
      storeId: req.body?.storeId,
    });
    if (!result.ok) {
      const status = result.error === 'not_found' ? 404 : 500;
      return res.status(status).json(result);
    }
    recordRuntimeAuthorityPathUsed({
      route: '/api/templates/:templateId/preview',
      toolName: 'preview_template',
      userId: actor.userId || null,
      source: 'template_api_read',
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

/**
 * POST /api/templates/:templateId/apply-website
 * HTTP surface for runtime action `apply_store_website_template` (confirmation-gated).
 */
router.post('/templates/:templateId/apply-website', requireAuth, featureGate, async (req, res) => {
  try {
    assertUiWriteAuthority(req);
    const actor = await resolveTemplateActor(req);
    const result = await executeTemplateRuntimeAction({
      action: 'apply_store_website_template',
      actor,
      payload: {
        templateId: req.params.templateId,
        storeId: req.body?.storeId,
        draftId: req.body?.draftId,
        sourceMissionId: req.body?.sourceMissionId || req.body?.missionId,
        versionId: req.body?.versionId,
        name: req.body?.name,
        selectedVariant: req.body?.selectedVariant,
        locale: req.body?.locale,
        idempotencyKey: req.body?.idempotencyKey,
        dataOverrides: req.body?.dataOverrides,
      },
      missionId: req.body?.missionId || req.body?.sourceMissionId,
      confirmed: req.body?.confirmed === true,
      source: 'template_api',
    });
    if (!result.ok) {
      const status =
        result.error === 'confirmation_required'
          ? 428
          : result.error === 'feature_disabled'
            ? 503
            : result.error === 'forbidden'
              ? 403
              : result.error === 'not_found'
                ? 404
                : 400;
      return res.status(status).json(result);
    }
    res.json(result);
  } catch (err) {
    if (err?.code === 'UI_WRITE_AUTHORITY_REQUIRED' || err?.code === 'RUNTIME_AUTHORITY_BYPASS') {
      return res.status(403).json({ ok: false, error: 'runtime_authority_required' });
    }
    console.error('[templates] apply-website error', err);
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

/** GET /api/template-instances/:instanceId */
router.get('/template-instances/:instanceId', requireAuth, featureGate, async (req, res) => {
  try {
    const actor = await resolveTemplateActor(req);
    const result = await getTemplateInstance({ actor, instanceId: req.params.instanceId });
    if (!result.ok) {
      const status = result.error === 'not_found' ? 404 : result.error === 'forbidden' ? 403 : 500;
      return res.status(status).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

export default router;
