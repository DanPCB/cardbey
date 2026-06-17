/**
 * Stable public slugs for discovered business identity pages (/business/:slug).
 * Derived deterministically from business name + city + seed id suffix (not exposed in UI).
 */

import { slugify } from '../../utils/slug.js';
import type { IngestedSeedRecord } from './types.js';

export function buildPublicBusinessSlug(seed: IngestedSeedRecord): string {
  const name = seed.normalized.businessName ?? 'business';
  const city = seed.normalized.city ?? '';
  const base = slugify(`${name}-${city}`) || 'business';
  const suffix = seed.id.replace(/-/g, '').slice(-6).toLowerCase();
  return `${base}-${suffix}`;
}

export function findSeedByPublicSlug(
  seeds: IngestedSeedRecord[],
  slug: string,
): IngestedSeedRecord | null {
  const normalized = String(slug ?? '').trim().toLowerCase();
  if (!normalized) return null;
  for (const seed of seeds) {
    if (buildPublicBusinessSlug(seed).toLowerCase() === normalized) {
      return seed;
    }
  }
  return null;
}
