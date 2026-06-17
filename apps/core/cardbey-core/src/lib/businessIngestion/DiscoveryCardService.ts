/**
 * Public Discovery Card model — marketplace-facing representation of claimable businesses.
 */

import { formatStoreLocation } from '../formatStoreLocation.js';
import { listClaimableSeeds } from './QaPromotionService.js';
import { buildPublicBusinessSlug } from './businessPublicSlug.js';
import { resolveDiscoveryCardHero } from './DiscoveryCardHeroResolver.js';
import {
  DISCOVERED_BUSINESS_BADGE,
  publicLifecycleLabel,
  translateSeedToPublicLifecycle,
  type PublicBusinessLifecycle,
} from './publicLifecycle.js';
import type { IngestedSeedRecord } from './types.js';

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
  const cat = `${seed.normalized.category ?? ''} ${seed.normalized.businessName ?? ''}`.toLowerCase();
  if (
    cat.includes('food') ||
    cat.includes('restaurant') ||
    cat.includes('cafe') ||
    cat.includes('bakery') ||
    cat.includes('bar')
  ) {
    return 'food';
  }
  if (
    cat.includes('product') ||
    cat.includes('shop') ||
    cat.includes('retail') ||
    cat.includes('store')
  ) {
    return 'products';
  }
  if (
    cat.includes('service') ||
    cat.includes('salon') ||
    cat.includes('clean') ||
    cat.includes('wellness') ||
    cat.includes('gym')
  ) {
    return 'services';
  }
  return 'other';
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

export async function listPublicDiscoveryCards(opts: {
  limit?: number;
  feedCategory?: PublicFeedCategory;
} = {}): Promise<PublicDiscoveryCard[]> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const seeds = await listClaimableSeeds();
  let cards = seeds
    .map(buildPublicDiscoveryCard)
    .filter((c): c is PublicDiscoveryCard => c != null);

  if (opts.feedCategory) {
    cards = cards.filter((c) => c.feedCategory === opts.feedCategory);
  }

  cards.sort((a, b) => a.businessName.localeCompare(b.businessName));
  return cards.slice(0, limit);
}
