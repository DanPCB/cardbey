import { PUBLISHED_ARTIFACT_VERSION } from './buildPublishedBusinessArtifact.js';
import { parseJsonBlob } from './parseJsonBlob.js';

/**
 * True when the active Prisma client (client-gen) exposes the projection delegate.
 * @param {object} prisma
 */
export function hasPublishedArtifactProjectionTable(prisma) {
  const delegate = prisma?.publishedArtifactProjection;
  return (
    delegate != null &&
    typeof delegate === 'object' &&
    (typeof delegate.upsert === 'function' || typeof delegate.findMany === 'function')
  );
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} projection
 * @param {{ sourceDraftId?: string|null, publishRunId?: string|null }} meta
 */
export async function persistPublishedBusinessArtifact(prisma, projection, meta = {}) {
  const businessId = projection.businessId;
  const sourceDraftId = meta.sourceDraftId ?? projection.diagnostics?.sourceDraftId ?? null;
  const publishRunId = meta.publishRunId ?? projection.diagnostics?.sourcePublishRunId ?? null;

  if (hasPublishedArtifactProjectionTable(prisma)) {
    const heroVideoUrl =
      typeof projection?.hero?.videoUrl === 'string' && projection.hero.videoUrl.trim()
        ? projection.hero.videoUrl.trim()
        : null;
    const heroMediaType = heroVideoUrl ? 'video' : 'image';

    await prisma.publishedArtifactProjection.upsert({
      where: { businessId },
      create: {
        artifactType: projection.artifactType ?? 'business',
        businessId,
        tenantId: projection.tenantId,
        storeId: projection.storeId ?? businessId,
        slug: projection.slug,
        version: projection.artifactVersion ?? PUBLISHED_ARTIFACT_VERSION,
        projectionJson: projection,
        heroVideoUrl,
        heroMediaType,
        sourceDraftId,
        publishRunId,
      },
      update: {
        tenantId: projection.tenantId,
        storeId: projection.storeId ?? businessId,
        slug: projection.slug,
        version: projection.artifactVersion ?? PUBLISHED_ARTIFACT_VERSION,
        projectionJson: projection,
        heroVideoUrl,
        heroMediaType,
        sourceDraftId,
        publishRunId,
        updatedAt: new Date(),
      },
    });
    return { storage: 'table' };
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { stylePreferences: true },
  });
  const prefs = parseJsonBlob(business?.stylePreferences) ?? {};
  prefs.publishedArtifactProjection = projection;
  await prisma.business.update({
    where: { id: businessId },
    data: { stylePreferences: prefs },
  });
  return { storage: 'stylePreferences' };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ businessId?: string, slug?: string }} query
 */
export async function loadPersistedProjection(prisma, query) {
  if (hasPublishedArtifactProjectionTable(prisma)) {
    let row = null;
    if (query.businessId) {
      row = await prisma.publishedArtifactProjection.findUnique({
        where: { businessId: query.businessId },
      });
    } else if (query.slug) {
      row = await prisma.publishedArtifactProjection.findFirst({
        where: { slug: query.slug },
        orderBy: { updatedAt: 'desc' },
      });
    }
    if (row?.projectionJson) {
      const json =
        typeof row.projectionJson === 'object' ? row.projectionJson : JSON.parse(String(row.projectionJson));
      return { projection: json, storage: 'table', row };
    }
    return null;
  }

  let business = null;
  if (query.businessId) {
    business = await prisma.business.findUnique({
      where: { id: query.businessId },
      select: { stylePreferences: true, slug: true },
    });
  } else if (query.slug) {
    business = await prisma.business.findFirst({
      where: { slug: query.slug, isActive: true },
      select: { stylePreferences: true, slug: true },
      orderBy: { publishedAt: 'desc' },
    });
  }
  const prefs = parseJsonBlob(business?.stylePreferences);
  if (prefs?.publishedArtifactProjection) {
    return { projection: prefs.publishedArtifactProjection, storage: 'stylePreferences', row: null };
  }
  return null;
}

/**
 * Batch-load persisted projections for list/feed endpoints.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} businessIds
 * @param {object[]} [businessRows] - optional rows with stylePreferences for embed fallback
 * @returns {Promise<Map<string, { projection: object, storage: string }>>}
 */
export async function loadPersistedProjectionsByBusinessIds(prisma, businessIds, businessRows = []) {
  const map = new Map();
  const ids = [...new Set(businessIds.filter(Boolean))];
  if (!ids.length) return map;

  if (hasPublishedArtifactProjectionTable(prisma)) {
    const rows = await prisma.publishedArtifactProjection.findMany({
      where: { businessId: { in: ids } },
    });
    for (const row of rows) {
      if (!row?.projectionJson) continue;
      const projection =
        typeof row.projectionJson === 'object'
          ? row.projectionJson
          : JSON.parse(String(row.projectionJson));
      map.set(row.businessId, { projection, storage: 'table' });
    }
  }

  for (const b of businessRows) {
    if (!b?.id || map.has(b.id)) continue;
    const prefs = parseJsonBlob(b.stylePreferences);
    if (prefs?.publishedArtifactProjection) {
      map.set(b.id, {
        projection: prefs.publishedArtifactProjection,
        storage: 'stylePreferences',
      });
    }
  }

  return map;
}
