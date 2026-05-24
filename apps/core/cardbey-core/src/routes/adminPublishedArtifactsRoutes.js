/**
 * Admin debug for canonical published artifact projections.
 */

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { loadPersistedProjection, hasPublishedArtifactProjectionTable } from '../services/publishedArtifactProjection/persistPublishedBusinessArtifact.js';
import { buildPublishedBusinessArtifact } from '../services/publishedArtifactProjection/buildPublishedBusinessArtifact.js';
import { parseJsonBlob } from '../services/publishedArtifactProjection/parseJsonBlob.js';
import { resolveHeroForProjection } from '../services/publishedArtifactProjection/resolveHeroForProjection.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

/**
 * GET /api/admin/published-artifacts/:slug/debug
 */
router.get('/published-artifacts/:slug/debug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').toLowerCase().trim();
    if (!slug) {
      return res.status(400).json({ ok: false, error: 'slug_required' });
    }

    const businesses = await prisma.business.findMany({
      where: { slug },
      select: {
        id: true,
        userId: true,
        name: true,
        slug: true,
        isActive: true,
        publishedAt: true,
        tagline: true,
        description: true,
        heroImageUrl: true,
        stylePreferences: true,
        socialLinks: true,
        updatedAt: true,
      },
      orderBy: { publishedAt: 'desc' },
    });

    const active = businesses.filter((b) => b.isActive);
    const persisted = await loadPersistedProjection(prisma, { slug });
    const projection = persisted?.projection ?? null;

    let heroSource = null;
    let taglineSource = null;
    let descriptionSource = null;
    if (projection) {
      heroSource = projection.hero?.source ?? 'projection';
      taglineSource = projection.content?.tagline ? 'projection.content.tagline' : 'empty';
      descriptionSource = projection.content?.description ? 'projection.content.description' : 'empty';
    } else if (active[0]) {
      const hero = resolveHeroForProjection({ business: active[0] });
      heroSource = hero.source;
      taglineSource = active[0].tagline ? 'business.tagline' : 'missing';
      descriptionSource = active[0].description ? 'business.description' : 'missing';
    }

    const rebuilt =
      active[0] &&
      buildPublishedBusinessArtifact({
        business: active[0],
        source: 'admin_debug_rebuild',
      });

    return res.json({
      ok: true,
      slug,
      businessSummary: businesses.map((b) => ({
        id: b.id,
        tenantId: b.userId,
        name: b.name,
        isActive: b.isActive,
        publishedAt: b.publishedAt?.toISOString?.() ?? null,
        updatedAt: b.updatedAt?.toISOString?.() ?? null,
      })),
      projectionExists: !!projection,
      projectionVersion: projection?.artifactVersion ?? null,
      projectionStorage: persisted?.storage ?? null,
      heroSource,
      taglineSource,
      descriptionSource,
      publicRoutesUsingProjection: {
        'GET /api/public/stores/:slug': true,
        'GET /api/storefront/frontscreen': true,
        'GET /api/storefront/homepage-stores': true,
      },
      duplicateBusinessesSameSlug: businesses.length > 1 ? businesses : [],
      activeCount: active.length,
      stylePreferencesHasEmbeddedProjection: !!parseJsonBlob(active[0]?.stylePreferences)
        ?.publishedArtifactProjection,
      tableAvailable: hasPublishedArtifactProjectionTable(prisma),
      projectionSocialLinks: projection?.content?.socialLinks ?? null,
      businessSocialLinks: active[0]?.socialLinks ?? null,
      rebuiltPreview: rebuilt
        ? {
            tagline: rebuilt.content?.tagline,
            description: rebuilt.content?.description,
            socialLinks: rebuilt.content?.socialLinks ?? null,
            heroType: rebuilt.hero?.type,
            heroVideo: rebuilt.hero?.videoUrl,
            sections: rebuilt.website?.sections?.length ?? 0,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
