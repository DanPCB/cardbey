import { buildPublishedBusinessArtifact } from './buildPublishedBusinessArtifact.js';
import { loadPersistedProjection } from './persistPublishedBusinessArtifact.js';
import { parseJsonBlob } from './parseJsonBlob.js';
import { businessPublicReadSelect } from '../../lib/dbCapabilities.js';

const BUSINESS_SELECT = businessPublicReadSelect();
/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ slug?: string, businessId?: string, includeProducts?: boolean }} opts
 */
export async function getPublishedBusinessArtifact(prisma, opts = {}) {
  const { slug, businessId, includeProducts = false } = opts;
  console.log('[PUBLIC_ARTIFACT_RESOLVE]', { slug: slug ?? null, businessId: businessId ?? null });

  const persisted = await loadPersistedProjection(prisma, { slug, businessId });
  if (persisted?.projection) {
    console.log('[PUBLIC_ARTIFACT_RENDER_SOURCE]', {
      source: 'persisted',
      storage: persisted.storage,
      slug: persisted.projection.slug,
      version: persisted.projection.artifactVersion,
    });
    return { projection: persisted.projection, source: 'persisted', usedFallback: false };
  }

  const where = businessId ? { id: businessId } : slug ? { slug, isActive: true } : null;
  if (!where) return { projection: null, source: 'none', usedFallback: true };

  const business = await prisma.business.findFirst({
    where,
    select: {
      ...BUSINESS_SELECT,
      ...(includeProducts
        ? {
            products: {
              where: { isPublished: true },
              orderBy: { name: 'asc' },
              take: 200,
            },
          }
        : {}),
    },
    orderBy: { publishedAt: 'desc' },
  });

  if (!business) {
    return { projection: null, source: 'none', usedFallback: true };
  }

  console.warn('[PUBLIC_ARTIFACT_FALLBACK_USED]', {
    slug: business.slug,
    businessId: business.id,
    reason: 'no_persisted_projection',
  });

  const projection = buildPublishedBusinessArtifact({
    business,
    source: 'runtime_rebuild',
  });
  return { projection, source: 'rebuilt', usedFallback: true };
}

/**
 * Resolve public store DTO from canonical projection when available.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} business - Business row (partial ok)
 * @param {object} [options] - lang, etc.
 */
export async function resolvePublicStoreFromArtifact(prisma, business, options = {}) {
  const { publishedBusinessArtifactToPublicStore } = await import(
    './publishedBusinessArtifactToPublicStore.js'
  );
  const { toPublicStore } = await import('../../utils/publicStoreMapper.js');

  const { projection, usedFallback } = await getPublishedBusinessArtifact(prisma, {
    businessId: business?.id,
    slug: business?.slug,
    includeProducts: Array.isArray(business?.products),
  });

  if (projection) {
    const store = publishedBusinessArtifactToPublicStore(projection, { business, ...options });
    const { attachPublicStoreAwarenessSignals } = await import(
      '../../utils/attachPublicStoreAwarenessSignals.js'
    );
    return {
      store: await attachPublicStoreAwarenessSignals(prisma, store),
      projection,
      usedFallback,
    };
  }

  const { attachPublicStoreAwarenessSignals } = await import(
    '../../utils/attachPublicStoreAwarenessSignals.js'
  );
  return {
    store: await attachPublicStoreAwarenessSignals(prisma, toPublicStore(business, options)),
    projection: null,
    usedFallback: true,
  };
}

export { parseJsonBlob };
