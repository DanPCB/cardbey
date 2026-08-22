/**
 * Count published stores per curated collection preset.
 */

import { CURATED_COLLECTIONS } from '../../config/curatedCollections.js';
import { normalizeSuburbLabel } from '../../utils/normalizeSuburbLabel.js';
import { findPublicBusinesses, publicStoreListWhere } from '../publishedArtifactProjection/findPublicBusinesses.js';
import { isPublicFeedEligibleBusiness } from '../../utils/publicStoreVisibility.js';
import { filterBusinessesForFeedCategory } from '../../lib/businessSemantic/resolveStoreCommercePresentation.js';
import { caseInsensitiveFilter } from '../../lib/dbCapabilities.js';
import { hasBusinessColumn } from '../../lib/businessColumnCapabilities.js';

const FEED_CATEGORIES = new Set(['food', 'products', 'services']);

function businessMatchesSuburb(business, suburbRaw) {
  const target = normalizeSuburbLabel(suburbRaw);
  if (!target) return true;
  return normalizeSuburbLabel(business?.suburb)?.toLowerCase() === target.toLowerCase();
}

function publishedWithinDays(business, days) {
  if (!days || days <= 0) return true;
  const anchor = business?.publishedAt ?? business?.createdAt;
  if (!anchor) return false;
  const ts = anchor instanceof Date ? anchor.getTime() : new Date(anchor).getTime();
  if (Number.isNaN(ts)) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return ts >= cutoff;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ suburb?: string | null }} [options]
 */
export async function resolveCuratedCollections(prisma, options = {}) {
  const scopeSuburb = normalizeSuburbLabel(options.suburb);

  const where = scopeSuburb && hasBusinessColumn('suburb')
    ? {
        ...publicStoreListWhere(),
        suburb: caseInsensitiveFilter(scopeSuburb),
      }
    : publicStoreListWhere();

  let businesses = await findPublicBusinesses(prisma, { where });
  businesses = businesses.filter(isPublicFeedEligibleBusiness);
  if (scopeSuburb) {
    businesses = businesses.filter((b) => businessMatchesSuburb(b, scopeSuburb));
  }

  const results = [];

  for (const collection of CURATED_COLLECTIONS) {
    if (!collection.active) continue;

    let matched = businesses;

    if (collection.filters.suburb) {
      matched = matched.filter((b) => businessMatchesSuburb(b, collection.filters.suburb));
    }

    const category = collection.filters.category;
    if (category && FEED_CATEGORIES.has(category)) {
      matched = await filterBusinessesForFeedCategory(prisma, matched, category);
    }

    if (collection.filters.publishedWithinDays) {
      matched = matched.filter((b) =>
        publishedWithinDays(b, collection.filters.publishedWithinDays),
      );
    }

    const count = matched.length;
    if (count < collection.minStoreCount) continue;

    results.push({
      id: collection.id,
      title: collection.title,
      subtitle: collection.subtitle,
      emoji: collection.emoji,
      count,
      filters: {
        ...(collection.filters.suburb ? { suburb: normalizeSuburbLabel(collection.filters.suburb) } : {}),
        ...(collection.filters.category ? { category: collection.filters.category } : {}),
        ...(collection.filters.publishedWithinDays
          ? { publishedWithinDays: collection.filters.publishedWithinDays }
          : {}),
      },
    });
  }

  return results;
}

/**
 * @param {string} collectionId
 */
export function getCuratedCollectionById(collectionId) {
  const id = String(collectionId ?? '').trim();
  if (!id) return null;
  return CURATED_COLLECTIONS.find((c) => c.active && c.id === id) ?? null;
}
