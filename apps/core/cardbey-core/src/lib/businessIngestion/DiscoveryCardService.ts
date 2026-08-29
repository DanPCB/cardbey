/**
 * Public Discovery Card model — marketplace-facing representation of claimable businesses.
 */

import { resolveCanonicalLocationFromSeedNormalized } from '../location/resolveCanonicalBusinessLocation.js';
import { listClaimableSeeds } from './QaPromotionService.js';
import { getPrismaClient } from '../prisma.js';
import {
  buildPublishedStoreNameKeySet,
  findPublishedStoreForSeed,
  normalizeBusinessIdentityName,
  type PublishedStoreIdentity,
} from './publishedStoreSeedMatch.js';
import { buildPublicBusinessSlug } from './businessPublicSlug.js';
import { resolvePublicMediaForSeed } from '../businessCandidate/media/resolvePublicCandidateMedia.js';
import { findBusinessCandidateForSeed } from '../businessCandidate/media/findBusinessCandidateForSeed.js';
import {
  resolvePublicCategoryLabel,
  resolvePublicDescription,
  resolvePublicLogoUrl,
} from '../businessCandidate/media/resolvePublicCandidatePresentation.js';
import {
  DISCOVERED_BUSINESS_BADGE,
  publicLifecycleLabel,
  translateSeedToPublicLifecycle,
  type PublicBusinessLifecycle,
} from './publicLifecycle.js';
import type { IngestedSeedRecord } from './types.js';
import { classifyBusinessVertical } from '../classifyBusinessVertical.js';
import { isSeedRolledBack } from '../businessCandidate/rollback/isRolledBack.js';

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
  logoUrl: string | null;
  representativeImageLabel: string | null;
  briefProfileUrl: string | null;
  candidateId: string | null;
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

export async function buildPublicDiscoveryCard(
  seed: IngestedSeedRecord,
): Promise<PublicDiscoveryCard | null> {
  if (isSeedRolledBack(seed)) return null;
  if (!seed.claimable || seed.storeId) return null;
  const publicLifecycle = translateSeedToPublicLifecycle(seed.verificationStatus);
  if (publicLifecycle !== 'discovered_business') return null;

  const n = seed.normalized;
  if (!n.businessName) return null;

  const canonical = resolveCanonicalLocationFromSeedNormalized(n);
  const locationLabel =
    canonical.source === 'unavailable' ? null : canonical.displayLocation;

  const candidate = await findBusinessCandidateForSeed(seed);
  const media = await resolvePublicMediaForSeed(seed);
  const feedCategory = inferFeedCategory(seed);
  const slug = buildPublicBusinessSlug(seed);
  const categoryLabel = resolvePublicCategoryLabel(seed, candidate);

  return {
    id: seed.id,
    slug,
    businessName: n.businessName,
    category: categoryLabel,
    categoryLabel,
    locationLabel,
    description: resolvePublicDescription(seed, candidate, locationLabel),
    heroImageUrl: media.heroImageUrl,
    heroImageSource: media.heroImageSource,
    logoUrl: resolvePublicLogoUrl(seed, candidate),
    representativeImageLabel: media.representativeImageLabel,
    briefProfileUrl: `/business/${slug}#bi-brief`,
    candidateId: media.candidateId,
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
  const built = await Promise.all(seeds.map((s) => buildPublicDiscoveryCard(s)));
  let cards = built
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
