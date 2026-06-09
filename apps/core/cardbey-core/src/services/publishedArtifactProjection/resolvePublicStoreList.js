/**
 * Projection-first resolver for public store lists and feeds.
 */

import { publicWebBase } from '../../utils/publicWebBase.js';
import { businessPublicReadSelect } from '../../lib/dbCapabilities.js';
import { buildPublishedBusinessArtifact } from './buildPublishedBusinessArtifact.js';
import { publishedBusinessArtifactToPublicStore } from './publishedBusinessArtifactToPublicStore.js';
import { loadPersistedProjectionsByBusinessIds } from './persistPublishedBusinessArtifact.js';
import { toPublicStore } from '../../utils/publicStoreMapper.js';
import { enrichStoreHeroVideoUrls } from '../../lib/videoIosSafe.js';
import { loadActiveFeedPromoArtifacts } from '../feed/loadActiveFeedPromoArtifacts.js';

/** Fields required for projection build + public DTO on list/feed routes. */
export const PUBLIC_STORE_LIST_SELECT = businessPublicReadSelect();

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object[]} businesses
 * @param {{ route?: string, lang?: string }} [opts]
 */
export async function resolvePublicStoresForList(prisma, businesses, opts = {}) {
  const { route = 'public_list', lang } = opts;
  if (!Array.isArray(businesses) || businesses.length === 0) {
    return [];
  }

  const businessIds = businesses.map((b) => b.id);
  const [projectionMap, feedPromoArtifactsByStore] = await Promise.all([
    loadPersistedProjectionsByBusinessIds(prisma, businessIds, businesses),
    loadActiveFeedPromoArtifacts(prisma, businessIds),
  ]);

  const webBase = publicWebBase();
  const results = [];

  for (const business of businesses) {
    console.log('[PUBLIC_ARTIFACT_RESOLVE]', {
      slug: business.slug ?? null,
      businessId: business.id ?? null,
      route,
    });

    const persisted = projectionMap.get(business.id);
    let projection = persisted?.projection ?? null;
    let usedFallback = false;

    if (projection) {
      console.log('[PUBLIC_ARTIFACT_RENDER_SOURCE]', {
        source: 'persisted',
        storage: persisted.storage,
        slug: projection.slug,
        route,
      });
    } else {
      console.warn('[PUBLIC_ARTIFACT_FALLBACK_USED]', {
        slug: business.slug,
        businessId: business.id,
        reason: 'no_persisted_projection',
        route,
      });
      projection = buildPublishedBusinessArtifact({
        business,
        source: 'runtime_rebuild',
      });
      usedFallback = true;
    }

    const store = projection
      ? publishedBusinessArtifactToPublicStore(projection, { business, lang })
      : toPublicStore(business, { lang });

    const slug = store.slug ?? business.slug;
    const storeUrl = slug ? `${webBase}/s/${encodeURIComponent(slug)}` : null;
    const feedPromoArtifacts = feedPromoArtifactsByStore.get(business.id) ?? [];
    const enriched = enrichStoreHeroVideoUrls(
      {
        ...store,
        storeUrl,
        ...(feedPromoArtifacts.length > 0 ? { feedPromoArtifacts } : {}),
      },
      {
        uploadsDir: process.env.UPLOADS_DIR,
      },
    );

    console.log('[PUBLIC_FEED_PROJECTION_PARITY]', {
      route,
      slug,
      businessId: business.id,
      usedFallback,
      name: enriched.name,
      tagline: enriched.tagline ?? null,
      description: enriched.description ?? null,
      heroVideo: enriched.heroVideo ?? null,
      heroUrl: enriched.heroUrl ?? null,
      websiteSections: enriched.website?.sections?.length ?? 0,
      storeUrl,
    });

    results.push({ store: enriched, projection, usedFallback });
  }

  return results;
}

/**
 * Extract comparable public fields for cross-route regression tests.
 * @param {object} store
 */
export function publicStoreParitySnapshot(store) {
  return {
    name: store?.name ?? null,
    slug: store?.slug ?? null,
    tagline: store?.tagline ?? null,
    description: store?.description ?? null,
    heroVideo: store?.heroVideo ?? null,
    heroUrl: store?.heroUrl ?? null,
    heroImage: store?.heroImage ?? null,
    websiteSections: store?.website?.sections?.length ?? 0,
    storeUrl: store?.storeUrl ?? null,
  };
}
