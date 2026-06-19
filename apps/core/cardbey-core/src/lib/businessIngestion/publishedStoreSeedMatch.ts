/**
 * Match ingestion seeds to published storefronts by business identity (name / slug).
 * Used to suppress stale claim cards and repair seed ↔ store links.
 */

import type { IngestedSeedRecord } from './types.js';

export function normalizeBusinessIdentityName(name: string | null | undefined): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\band\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

export type PublishedStoreIdentity = {
  id: string;
  name: string;
  slug: string;
  publishedAt?: Date | string | null;
};

export function seedMatchesPublishedStore(
  seed: Pick<IngestedSeedRecord, 'normalized'>,
  store: PublishedStoreIdentity,
): boolean {
  const seedName = normalizeBusinessIdentityName(seed.normalized.businessName);
  const storeName = normalizeBusinessIdentityName(store.name);
  if (seedName.length >= 4 && storeName.length >= 4 && seedName === storeName) {
    return true;
  }

  const slug = String(store.slug ?? '').toLowerCase().trim();
  if (!slug || seedName.length < 4) return false;

  const slugStem = slug.replace(/-and-/g, '-').replace(/-\d+$/g, '');
  return slugStem.includes(seedName.slice(0, Math.min(seedName.length, 12)));
}

export function findPublishedStoreForSeed(
  seed: Pick<IngestedSeedRecord, 'normalized'>,
  stores: PublishedStoreIdentity[],
): PublishedStoreIdentity | null {
  for (const store of stores) {
    if (seedMatchesPublishedStore(seed, store)) return store;
  }
  return null;
}

export function buildPublishedStoreNameKeySet(stores: PublishedStoreIdentity[]): Set<string> {
  const keys = new Set<string>();
  for (const store of stores) {
    const key = normalizeBusinessIdentityName(store.name);
    if (key) keys.add(key);
  }
  return keys;
}
