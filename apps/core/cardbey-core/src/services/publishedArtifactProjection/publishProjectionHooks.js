import { buildPublishedBusinessArtifact } from './buildPublishedBusinessArtifact.js';
import { validatePublishedBusinessArtifact } from './validatePublishedBusinessArtifact.js';
import { persistPublishedBusinessArtifact } from './persistPublishedBusinessArtifact.js';
import { parseJsonBlob } from './parseJsonBlob.js';
import { heroImageUrlForBusinessColumn } from '../draftStore/publishDraftHeroHelpers.js';

/**
 * Build, validate, persist projection and sync indexed Business columns.
 */
export async function buildPersistAndApplyPublishedProjection(prisma, ctx) {
  const {
    businessId,
    tenantId,
    draft = null,
    draftPreview = null,
    publishRunId = null,
    source = 'publishDraft',
  } = ctx;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      products: { where: { isPublished: true }, orderBy: { name: 'asc' }, take: 200 },
    },
  });
  if (!business) {
    console.warn('[PUBLISH_PROJECTION_BUILD_START]', { businessId, error: 'business_not_found' });
    return null;
  }

  console.log('[PUBLISH_PROJECTION_BUILD_START]', {
    businessId,
    slug: business.slug,
    draftId: draft?.id ?? null,
  });

  const projection = buildPublishedBusinessArtifact({
    business,
    draft,
    draftPreview,
    publishRunId,
    source,
  });

  const validation = validatePublishedBusinessArtifact(projection);
  projection.diagnostics.warnings = validation.warnings;

  if (validation.warnings.length) {
    console.warn('[PUBLISH_PROJECTION_WARNINGS]', {
      businessId,
      slug: projection.slug,
      warnings: validation.warnings,
    });
  }

  console.log('[PUBLISH_PROJECTION_BUILD_SUCCESS]', {
    businessId,
    slug: projection.slug,
    heroType: projection.hero?.type,
    tagline: projection.content?.tagline ? '(set)' : '(empty)',
  });

  console.log('[PUBLISH_PROJECTION_PERSIST_START]', { businessId, slug: projection.slug });
  const persistResult = await persistPublishedBusinessArtifact(prisma, projection, {
    sourceDraftId: draft?.id ?? null,
    publishRunId,
  });
  console.log('[PUBLISH_PROJECTION_PERSIST_SUCCESS]', {
    businessId,
    storage: persistResult.storage,
  });

  const hero = projection.hero ?? {};
  const existingPrefs = parseJsonBlob(business.stylePreferences) ?? {};
  const existingMini = existingPrefs.miniWebsite ?? {};
  const heroImageUrl = heroImageUrlForBusinessColumn(
    hero.videoUrl ?? null,
    hero.posterUrl ?? hero.imageUrl ?? null,
  );

  if (process.env.NODE_ENV !== 'production') {
    console.log('[public-video-chain] publish_payload', {
      storeId: businessId,
      heroType: hero.type ?? null,
      heroVideoUrl: hero.videoUrl ?? null,
      heroImageUrl: hero.posterUrl ?? hero.imageUrl ?? null,
      heroPosterUrl: hero.posterUrl ?? null,
      hero,
    });
  }

  const brandLogoUrl =
    typeof projection.brand?.logoUrl === 'string' && projection.brand.logoUrl.trim()
      ? projection.brand.logoUrl.trim()
      : null;

  const stylePreferences = {
    ...existingPrefs,
    ...(hero.videoUrl ? { heroVideo: hero.videoUrl } : {}),
    miniWebsite: {
      ...existingMini,
      sections: projection.website?.sections ?? existingMini.sections ?? [],
      updatedAt: new Date().toISOString(),
    },
  };
  if (hero.type === 'video') {
    const poster =
      hero.posterUrl ||
      (hero.imageUrl && !/\.(mp4|webm|mov)(\?|#|$)/i.test(hero.imageUrl) ? hero.imageUrl : null);
    if (poster) stylePreferences.heroImage = poster;
    else delete stylePreferences.heroImage;
  } else if (hero.imageUrl) {
    stylePreferences.heroImage = hero.imageUrl;
    delete stylePreferences.heroVideo;
  }

  const updateData = {
    name: projection.name,
    slug: projection.slug,
    tagline: projection.content?.tagline ?? null,
    description: projection.content?.description ?? null,
    heroImageUrl,
    ...(brandLogoUrl ? { avatarImageUrl: brandLogoUrl } : {}),
    isActive: projection.status === 'published',
    publishedAt: projection.publishedAt ? new Date(projection.publishedAt) : new Date(),
    stylePreferences,
  };

  await prisma.business.update({
    where: { id: businessId },
    data: updateData,
  });

  return projection;
}
