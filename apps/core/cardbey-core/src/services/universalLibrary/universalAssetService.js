/**
 * Universal Asset CRUD — fail-closed publish.
 */

import {
  ASSET_STATUS,
  RIGHTS_STATUS,
  canPublishAsset,
  isKnownAssetType,
  normalizeStringArray,
} from './universalAssetTypes.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function createUniversalAsset(prisma, input) {
  const title = String(input?.title ?? '').trim();
  if (!title) {
    return { ok: false, error: 'title_required', status: 400 };
  }
  const type = String(input?.type ?? 'other').toLowerCase();
  if (!isKnownAssetType(type)) {
    return { ok: false, error: 'invalid_type', status: 400 };
  }
  const provider = String(input?.provider ?? 'cardbey_internal').trim();
  if (!provider) {
    return { ok: false, error: 'provider_required', status: 400 };
  }

  const asset = await prisma.universalAsset.create({
    data: {
      title,
      description: input?.description ? String(input.description) : null,
      type,
      provider,
      sourceUrl: input?.sourceUrl ? String(input.sourceUrl) : null,
      license: input?.license ? String(input.license) : null,
      categories: normalizeStringArray(input?.categories),
      tags: normalizeStringArray(input?.tags),
      language: input?.language ? String(input.language) : null,
      country: input?.country ? String(input.country) : null,
      ownerId: input?.ownerId ? String(input.ownerId) : null,
      creatorId: input?.creatorId ? String(input.creatorId) : null,
      thumbnail: input?.thumbnail ? String(input.thumbnail) : null,
      preview: input?.preview ? String(input.preview) : null,
      metadata: input?.metadata ?? null,
      rightsStatus: input?.rightsStatus
        ? String(input.rightsStatus).toUpperCase()
        : RIGHTS_STATUS.UNKNOWN,
      hostingMode: input?.hostingMode ? String(input.hostingMode).toUpperCase() : undefined,
      qualityScore: Number.isFinite(Number(input?.qualityScore))
        ? Number(input.qualityScore)
        : 0,
      status:
        input?.status && String(input.status).toUpperCase() !== ASSET_STATUS.PUBLISHED
          ? String(input.status).toUpperCase()
          : ASSET_STATUS.DISCOVERED,
    },
  });

  return { ok: true, asset };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} id
 * @param {object} patch
 */
export async function updateUniversalAsset(prisma, id, patch) {
  const assetId = String(id ?? '').trim();
  if (!assetId) return { ok: false, error: 'id_required', status: 400 };

  const existing = await prisma.universalAsset.findUnique({ where: { id: assetId } });
  if (!existing) return { ok: false, error: 'not_found', status: 404 };

  /** @type {Record<string, unknown>} */
  const data = {};
  if (patch?.title != null) data.title = String(patch.title).trim();
  if (patch?.description != null) data.description = patch.description ? String(patch.description) : null;
  if (patch?.type != null) {
    const type = String(patch.type).toLowerCase();
    if (!isKnownAssetType(type)) return { ok: false, error: 'invalid_type', status: 400 };
    data.type = type;
  }
  if (patch?.provider != null) data.provider = String(patch.provider).trim();
  if (patch?.sourceUrl != null) data.sourceUrl = patch.sourceUrl ? String(patch.sourceUrl) : null;
  if (patch?.license != null) data.license = patch.license ? String(patch.license) : null;
  if (patch?.categories != null) data.categories = normalizeStringArray(patch.categories);
  if (patch?.tags != null) data.tags = normalizeStringArray(patch.tags);
  if (patch?.language != null) data.language = patch.language ? String(patch.language) : null;
  if (patch?.country != null) data.country = patch.country ? String(patch.country) : null;
  if (patch?.ownerId != null) data.ownerId = patch.ownerId ? String(patch.ownerId) : null;
  if (patch?.creatorId != null) data.creatorId = patch.creatorId ? String(patch.creatorId) : null;
  if (patch?.thumbnail != null) data.thumbnail = patch.thumbnail ? String(patch.thumbnail) : null;
  if (patch?.preview != null) data.preview = patch.preview ? String(patch.preview) : null;
  if (patch?.metadata != null) data.metadata = patch.metadata;
  if (patch?.rightsStatus != null) data.rightsStatus = String(patch.rightsStatus).toUpperCase();
  if (patch?.hostingMode != null) data.hostingMode = String(patch.hostingMode).toUpperCase();
  if (patch?.qualityScore != null && Number.isFinite(Number(patch.qualityScore))) {
    data.qualityScore = Number(patch.qualityScore);
  }
  if (patch?.status != null) {
    const nextStatus = String(patch.status).toUpperCase();
    if (nextStatus === ASSET_STATUS.PUBLISHED && !canPublishAsset({ ...existing, ...data })) {
      return { ok: false, error: 'publish_blocked', status: 403 };
    }
    data.status = nextStatus;
  }
  if (patch?.duplicateOfId != null) {
    data.duplicateOfId = patch.duplicateOfId ? String(patch.duplicateOfId) : null;
  }

  const asset = await prisma.universalAsset.update({ where: { id: assetId }, data });
  return { ok: true, asset };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} id
 */
export async function getUniversalAsset(prisma, id) {
  const assetId = String(id ?? '').trim();
  if (!assetId) return { ok: false, error: 'id_required', status: 400 };
  const asset = await prisma.universalAsset.findUnique({
    where: { id: assetId },
    include: { discoveryScore: true },
  });
  if (!asset) return { ok: false, error: 'not_found', status: 404 };
  return { ok: true, asset };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} filters
 */
export async function listUniversalAssets(prisma, filters = {}) {
  const take = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
  const skip = Math.max(Number(filters.offset) || 0, 0);

  /** @type {import('@prisma/client').Prisma.UniversalAssetWhereInput} */
  const where = {};
  if (filters.status) where.status = String(filters.status).toUpperCase();
  if (filters.provider) where.provider = String(filters.provider);
  if (filters.type) where.type = String(filters.type).toLowerCase();
  if (filters.publishedOnly) where.status = ASSET_STATUS.PUBLISHED;

  const [items, total] = await Promise.all([
    prisma.universalAsset.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take,
      skip,
      include: { discoveryScore: true },
    }),
    prisma.universalAsset.count({ where }),
  ]);

  return { ok: true, items, total, limit: take, offset: skip };
}

/**
 * Fail-closed publish — requires CLEARED rights and ownerId.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} id
 */
export async function publishUniversalAsset(prisma, id) {
  const assetId = String(id ?? '').trim();
  if (!assetId) return { ok: false, error: 'id_required', status: 400 };

  const existing = await prisma.universalAsset.findUnique({ where: { id: assetId } });
  if (!existing) return { ok: false, error: 'not_found', status: 404 };

  if (!canPublishAsset(existing)) {
    const reason =
      String(existing.rightsStatus ?? '').toUpperCase() !== RIGHTS_STATUS.CLEARED
        ? 'rights_not_cleared'
        : 'owner_missing';
    return { ok: false, error: 'publish_blocked', reason, status: 403 };
  }

  const asset = await prisma.universalAsset.update({
    where: { id: assetId },
    data: { status: ASSET_STATUS.PUBLISHED },
  });

  return { ok: true, asset };
}
