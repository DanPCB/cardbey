/**
 * Related businesses for public storefronts — query + cache + rank.
 */

import {
  TAXONOMY_VERSION,
  RANKING_VERSION,
  buildRelatedCacheKey,
  resolveStoreTaxonomy,
} from './businessCategoryTaxonomy.js';
import { rankRelatedCandidates } from './relatedBusinessRanker.js';
import { isPublicFeedEligibleBusiness } from '../../utils/publicStoreVisibility.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
/** @type {Map<string, { expiresAt: number, payload: unknown }>} */
const cache = new Map();

export function clearRelatedBusinessCache() {
  cache.clear();
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} slug
 * @param {{ limit?: number, diagnostics?: boolean }} [options]
 */
export async function getRelatedBusinessesForSlug(prisma, slug, options = {}) {
  const normalizedSlug = String(slug || '').toLowerCase().trim();
  if (!normalizedSlug) {
    return {
      ok: false,
      error: 'invalid_slug',
      items: [],
      generalFallback: [],
      context: null,
    };
  }

  const source = await prisma.business.findUnique({
    where: { slug: normalizedSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      type: true,
      description: true,
      suburb: true,
      city: true,
      isActive: true,
      publishedAt: true,
      claimStatus: true,
      isGuestDraft: true,
      userId: true,
      expiresAt: true,
      avatarImageUrl: true,
      heroImageUrl: true,
      logo: true,
    },
  });

  if (!source || !source.isActive || !isPublicFeedEligibleBusiness(source)) {
    return {
      ok: false,
      error: 'store_not_found',
      items: [],
      generalFallback: [],
      context: null,
    };
  }

  const sourceTax = resolveStoreTaxonomy(source);
  const cacheKey = buildRelatedCacheKey({
    storeId: source.id,
    category: sourceTax.category,
    subcategory: sourceTax.subcategory,
    location: sourceTax.location,
  });

  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > now && !options.diagnostics) {
    return hit.payload;
  }

  const candidates = await prisma.business.findMany({
    where: {
      id: { not: source.id },
      isActive: true,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      type: true,
      description: true,
      suburb: true,
      city: true,
      isActive: true,
      publishedAt: true,
      claimStatus: true,
      isGuestDraft: true,
      userId: true,
      expiresAt: true,
      avatarImageUrl: true,
      heroImageUrl: true,
      logo: true,
      updatedAt: true,
    },
    take: 120,
    orderBy: [{ updatedAt: 'desc' }],
  });

  const eligible = candidates
    .filter(isPublicFeedEligibleBusiness)
    .filter((b) => String(b.slug || '').trim().length > 0)
    .map((b) => {
      let logoUrl = null;
      try {
        if (b.logo) {
          const parsed = typeof b.logo === 'string' ? JSON.parse(b.logo) : b.logo;
          logoUrl = parsed?.url || null;
        }
      } catch {
        logoUrl = null;
      }
      return {
        id: b.id,
        slug: b.slug,
        name: b.name,
        type: b.type,
        description: b.description,
        suburb: b.suburb,
        city: b.city,
        isActive: b.isActive === true,
        publishedAt: b.publishedAt,
        hasPublicStorefront: true,
        imageUrl: b.heroImageUrl || b.avatarImageUrl || logoUrl || null,
        href: `/s/${b.slug}`,
      };
    });

  const ranked = rankRelatedCandidates(source, eligible, {
    limit: options.limit ?? 8,
    diagnostics: options.diagnostics === true,
  });

  const mapItem = (row) => ({
    id: row.id,
    slug: row.slug,
    title: row.name,
    storeName: row.name,
    type: row.type,
    imageUrl: row.imageUrl || null,
    href: row.href || `/s/${row.slug}`,
    score: row._relatedScore,
    reasons: options.diagnostics ? row._relatedReasons : undefined,
  });

  const payload = {
    ok: true,
    items: ranked.related.map(mapItem),
    generalFallback: ranked.generalFallback.map(mapItem),
    context: {
      sourceStoreId: source.id,
      sourceSlug: source.slug,
      category: sourceTax.category,
      subcategory: sourceTax.subcategory,
      location: sourceTax.location,
      cuisine: sourceTax.cuisine,
      fallbackLevel: ranked.context.fallbackLevel,
      taxonomyVersion: TAXONOMY_VERSION,
      rankingVersion: RANKING_VERSION,
    },
    diagnostics: ranked.diagnostics,
  };

  cache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, payload });
  return payload;
}
