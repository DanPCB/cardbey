/**
 * Public Discovery Card model — marketplace-facing representation of claimable businesses.
 */

import { formatStoreLocation } from '../formatStoreLocation.js';
import { listClaimableSeeds } from './QaPromotionService.js';
import { getPrismaClient } from '../prisma.js';
import {
  buildPublishedStoreNameKeySet,
  findPublishedStoreForSeed,
  normalizeBusinessIdentityName,
  type PublishedStoreIdentity,
} from './publishedStoreSeedMatch.js';
import { buildPublicBusinessSlug } from './businessPublicSlug.js';
import { resolveDiscoveryCardHero } from './DiscoveryCardHeroResolver.js';
import {
  DISCOVERED_BUSINESS_BADGE,
  publicLifecycleLabel,
  translateSeedToPublicLifecycle,
  type PublicBusinessLifecycle,
} from './publicLifecycle.js';
import type { IngestedSeedRecord } from './types.js';
import { classifyBusinessVertical } from '../classifyBusinessVertical.js';

export type PublicFeedCategory = 'food' | 'products' | 'services' | 'other';

export interface PublicDiscoveryCard {
  id: string;
  slug: string;
  businessName: string;
  category: string | null;
  categoryLabel: string | null;
  locationLabel: string | null;
  description: string | null;
  heroImageUrl: string;
  heroImageSource: string;
  publicLifecycle: PublicBusinessLifecycle;
  lifecycleLabel: string;
  badge: string;
  claimUrl: string;
  profileUrl: string;
  feedCategory: PublicFeedCategory;
}

function inferFeedCategory(seed: IngestedSeedRecord): PublicFeedCategory {
  const classification = classifyBusinessVertical({
    category: seed.normalized.category,
    businessType: seed.normalized.category,
    businessName: seed.normalized.businessName,
  });
  if (classification.feedCategory === 'others') return 'other';
  return classification.feedCategory;
}

function buildDescription(seed: IngestedSeedRecord, locationLabel: string | null): string {
  const name = seed.normalized.businessName ?? 'This business';
  const category = seed.normalized.category;
  if (category && locationLabel) {
    return `${name} — a local ${category} in ${locationLabel}. Claim your profile to manage your storefront on Cardbey.`;
  }
  if (locationLabel) {
    return `${name} in ${locationLabel}. Claim your business profile on Cardbey.`;
  }
  return `${name}. Claim your business profile on Cardbey.`;
}

export function buildPublicDiscoveryCard(seed: IngestedSeedRecord): PublicDiscoveryCard | null {
  if (!seed.claimable || seed.storeId) return null;
  const publicLifecycle = translateSeedToPublicLifecycle(seed.verificationStatus);
  if (publicLifecycle !== 'discovered_business') return null;

  const n = seed.normalized;
  if (!n.businessName) return null;

  const locationLabel = formatStoreLocation({
    city: n.city,
    state: n.state,
    country: n.country,
    address: n.address,
  });

  const hero = resolveDiscoveryCardHero(seed);
  const feedCategory = inferFeedCategory(seed);
  const slug = buildPublicBusinessSlug(seed);

  return {
    id: seed.id,
    slug,
    businessName: n.businessName,
    category: n.category,
    categoryLabel: n.category,
    locationLabel,
    description: buildDescription(seed, locationLabel),
    heroImageUrl: hero.heroImageUrl,
    heroImageSource: hero.heroImageSource,
    publicLifecycle,
    lifecycleLabel: publicLifecycleLabel(publicLifecycle),
    badge: DISCOVERED_BUSINESS_BADGE,
    claimUrl: `/activate-business/${seed.id}`,
    profileUrl: `/business/${slug}`,
    feedCategory,
  };
}

async function loadPublishedStoreIdentities(): Promise<PublishedStoreIdentity[]> {
  try {
    const prisma = getPrismaClient();
    return await prisma.business.findMany({
      where: { isActive: true, publishedAt: { not: null } },
      select: { id: true, name: true, slug: true, publishedAt: true },
    });
  } catch {
    return [];
  }
}

export async function listPublicDiscoveryCards(opts: {
  limit?: number;
  feedCategory?: PublicFeedCategory;
} = {}): Promise<PublicDiscoveryCard[]> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const [seeds, publishedStores] = await Promise.all([
    listClaimableSeeds(),
    loadPublishedStoreIdentities(),
  ]);
  const publishedNameKeys = buildPublishedStoreNameKeySet(publishedStores);
  let cards = seeds
    .map(buildPublicDiscoveryCard)
    .filter((c): c is PublicDiscoveryCard => c != null)
    .filter(
      (c) => !publishedNameKeys.has(normalizeBusinessIdentityName(c.businessName)),
    );

  if (opts.feedCategory) {
    cards = cards.filter((c) => c.feedCategory === opts.feedCategory);
  }

  cards.sort((a, b) => a.businessName.localeCompare(b.businessName));
  return cards.slice(0, limit);
}
