/**
 * Capability Engine API — /api/capability-engine
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { optionalAuth, requireAuth, requireAdmin } from '../middleware/auth.js';
import { Features } from '../config/features.js';
import { createCapabilityRepository } from '../services/capabilityEngine/capabilityRepository.js';
import { evaluateCapabilityApplicability } from '../services/capabilityEngine/applicabilityEvaluator.js';
import {
  planCapabilityApplication,
  executeCapabilityApplication,
  rollbackCapabilityInstallation,
} from '../services/capabilityEngine/planAndExecute.js';
import { seedFrenchCafeCapability } from '../services/capabilityEngine/seedFrenchCafeCapability.js';
import { CAPABILITY_STATUS } from '../services/capabilityEngine/capabilityTypes.js';

const router = Router();

function failClosed(res, code = 'feature_disabled') {
  return res.status(404).json({ ok: false, error: code });
}

function engineEnabled() {
  return Boolean(Features.capabilityEngine?.v1);
}

/** GET /capabilities — public published catalogue */
router.get('/capabilities', optionalAuth, async (req, res, next) => {
  try {
    if (!engineEnabled() || !Features.capabilityEngine?.libraryV1) {
      return failClosed(res, 'capability_library_disabled');
    }
    const repo = createCapabilityRepository(prisma);
    const all = await repo.listCapabilities({ status: CAPABILITY_STATUS.PUBLISHED });
    const items = [];
    for (const c of all) {
      if (c.visibility !== 'public' && !req.user) continue;
      const version = c.currentVersionId ? await repo.getVersion(c.currentVersionId) : null;
      const components = version ? await repo.listComponents(version.id) : [];
      const installCount = await repo.countInstallations(c.id);
      items.push({
        id: c.id,
        slug: c.slug,
        name: c.name,
        summary: c.summary,
        description: c.description,
        capabilityType: c.capabilityType,
        industry: c.industry,
        status: c.status,
        versionLabel: version?.versionLabel || null,
        versionNumber: version?.versionNumber || null,
        componentCount: components.length,
        installationCount: installCount,
        licence: c.defaultLicenceCode,
        previewAssetIds: c.previewAssetIds || [],
        creatorId: c.creatorId,
        supportedTargets: version?.compatibilityDefinition?.targetTypes || ['DRAFT_STORE'],
        outcome: c.summary,
      });
    }
    return res.json({ ok: true, capabilities: items, authority: 'core' });
  } catch (err) {
    next(err);
  }
});

/** GET /capabilities/:slug */
router.get('/capabilities/:slug', optionalAuth, async (req, res, next) => {
  try {
    if (!engineEnabled() || !Features.capabilityEngine?.libraryV1) {
      return failClosed(res, 'capability_library_disabled');
    }
    const repo = createCapabilityRepository(prisma);
    const c = await repo.getBySlug(req.params.slug);
    if (!c || c.status !== CAPABILITY_STATUS.PUBLISHED) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const versions = await repo.listVersions(c.id);
    const version = c.currentVersionId
      ? await repo.getVersion(c.currentVersionId)
      : versions[versions.length - 1];
    const components = version ? await repo.listComponents(version.id) : [];
    const installCount = await repo.countInstallations(c.id);
    return res.json({
      ok: true,
      capability: {
        ...c,
        currentVersion: version,
        components,
        versions: versions.map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          versionLabel: v.versionLabel,
          status: v.status,
          publishedAt: v.publishedAt,
          changelog: v.changelog,
        })),
        installationCount: installCount,
        whatItDoes: c.description,
        whatItCreates: [
          'Draft storefront template configuration',
          'Menu category placeholders',
          'Promotion draft artifact',
          'Inactive display playlist',
        ],
        whatItChanges: ['Owned DraftStore input/preview only'],
        rollbackSupport: true,
        purchaseAvailable: false,
      },
      authority: 'core',
    });
  } catch (err) {
    next(err);
  }
});

/** POST /capabilities/:slug/applicability */
router.post('/capabilities/:slug/applicability', requireAuth, async (req, res, next) => {
  try {
    if (!engineEnabled() || !Features.capabilityEngine?.applicationV1) {
      return failClosed(res, 'capability_application_disabled');
    }
    const repo = createCapabilityRepository(prisma);
    const c = await repo.getBySlug(req.params.slug);
    if (!c?.currentVersionId) return res.status(404).json({ ok: false, error: 'not_found' });
    const result = await evaluateCapabilityApplicability(prisma, {
      capabilityVersionId: c.currentVersionId,
      targetType: req.body?.targetType,
      targetId: req.body?.targetId,
      actorUserId: req.user?.id,
      inputs: req.body?.inputs,
      isAdmin: Boolean(req.user?.role === 'admin' || req.user?.isAdmin),
    });
    return res.json({ ok: true, ...result, authority: 'core' });
  } catch (err) {
    next(err);
  }
});

/** POST /capabilities/:slug/plan */
router.post('/capabilities/:slug/plan', requireAuth, async (req, res, next) => {
  try {
    if (!engineEnabled() || !Features.capabilityEngine?.applicationV1) {
      return failClosed(res, 'capability_application_disabled');
    }
    const repo = createCapabilityRepository(prisma);
    const c = await repo.getBySlug(req.params.slug);
    if (!c?.currentVersionId) return res.status(404).json({ ok: false, error: 'not_found' });
    const result = await planCapabilityApplication(prisma, {
      capabilityVersionId: c.currentVersionId,
      targetType: req.body?.targetType,
      targetId: req.body?.targetId,
      actorUserId: req.user?.id,
      inputs: req.body?.inputs,
      isAdmin: Boolean(req.user?.role === 'admin' || req.user?.isAdmin),
    });
    if (!result.ok) return res.status(400).json(result);
    return res.status(201).json({ ...result, authority: 'core' });
  } catch (err) {
    next(err);
  }
});

/** POST /installations/:id/execute */
router.post('/installations/:id/execute', requireAuth, async (req, res, next) => {
  try {
    if (!engineEnabled() || !Features.capabilityEngine?.applicationV1) {
      return failClosed(res, 'capability_application_disabled');
    }
    const result = await executeCapabilityApplication(prisma, {
      installationId: req.params.id,
      confirm: req.body?.confirm === true,
      inputs: req.body?.inputs,
      actorUserId: req.user?.id,
      isAdmin: Boolean(req.user?.role === 'admin' || req.user?.isAdmin),
    });
    if (!result.ok) return res.status(400).json(result);
    return res.json({ ...result, authority: 'core' });
  } catch (err) {
    next(err);
  }
});

/** POST /installations/:id/rollback */
router.post('/installations/:id/rollback', requireAuth, async (req, res, next) => {
  try {
    if (!engineEnabled() || !Features.capabilityEngine?.applicationV1) {
      return failClosed(res, 'capability_application_disabled');
    }
    const result = await rollbackCapabilityInstallation(prisma, {
      installationId: req.params.id,
      actorUserId: req.user?.id,
      reason: req.body?.reason || 'user_rollback',
    });
    if (!result.ok && !result.partial) return res.status(400).json(result);
    return res.json({ ...result, authority: 'core' });
  } catch (err) {
    next(err);
  }
});

/** GET /installations/:id */
router.get('/installations/:id', requireAuth, async (req, res, next) => {
  try {
    if (!engineEnabled()) return failClosed(res);
    const repo = createCapabilityRepository(prisma);
    const installation = await repo.getInstallation(req.params.id);
    if (!installation) return res.status(404).json({ ok: false, error: 'not_found' });
    const events = await repo.listEvents(installation.id);
    return res.json({ ok: true, installation, events, authority: 'core' });
  } catch (err) {
    next(err);
  }
});

/** Admin ops */
router.get('/admin/overview', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!engineEnabled() || !Features.capabilityEngine?.operationsV1) {
      return failClosed(res, 'capability_ops_disabled');
    }
    const repo = createCapabilityRepository(prisma);
    const all = await repo.listCapabilities();
    const published = all.filter((c) => c.status === CAPABILITY_STATUS.PUBLISHED);
    const installs = await repo.listInstallations({});
    const installed = installs.filter((i) => i.status === 'INSTALLED');
    const failed = installs.filter((i) => i.status === 'FAILED');
    const rolled = installs.filter((i) => i.status === 'ROLLED_BACK');
    return res.json({
      ok: true,
      metrics: {
        publishedCapabilities: published.length,
        draftCapabilities: all.filter((c) => c.status === 'DRAFT').length,
        installations: installed.length,
        failedInstallations: failed.length,
        rollbackCount: rolled.length,
        rollbackRate: installed.length + rolled.length
          ? rolled.length / (installed.length + rolled.length)
          : 0,
      },
      capabilities: all,
      recentInstallations: installs.slice(0, 20),
      authority: 'core',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/seed-french-cafe', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!engineEnabled()) return failClosed(res);
    const result = await seedFrenchCafeCapability(prisma);
    return res.json({ ...result, authority: 'core' });
  } catch (err) {
    next(err);
  }
});

export default router;
