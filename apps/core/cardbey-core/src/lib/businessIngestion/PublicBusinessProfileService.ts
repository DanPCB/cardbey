/**
 * Public business identity profile — canonical /business/:slug page data.
 * Never exposes ingestion internals in API responses.
 */

import { resolveCanonicalLocationFromSeedNormalized } from '../location/resolveCanonicalBusinessLocation.js';
import { getPrismaClient } from '../prisma.js';
import { listSeedRecords } from './IngestionRepository.js';
import { buildPublicBusinessSlug, findSeedByPublicSlug } from './businessPublicSlug.js';
import { findPublishedStoreForSeed, type PublishedStoreIdentity } from './publishedStoreSeedMatch.js';
import { resolvePublicMediaForSeed } from '../businessCandidate/media/resolvePublicCandidateMedia.js';
import { findBusinessCandidateForSeed } from '../businessCandidate/media/findBusinessCandidateForSeed.js';
import {
  ensureIntelligenceBriefFromEnrichment,
  resolvePublicCategoryLabel,
  resolvePublicDescription,
} from '../businessCandidate/media/resolvePublicCandidatePresentation.js';
import { resolvePilotCategoryKey } from '../businessCandidate/media/categoryMediaVocabulary.js';
import { getBriefByCandidateId, getBriefBySeedId } from '../businessCandidate/brief/briefRepository.js';
import {
  briefSummaryForPublic,
  generateBusinessIntelligenceBriefForSeed,
} from '../businessCandidate/brief/generateBusinessIntelligenceBrief.js';
import {
  DISCOVERED_BUSINESS_BADGE,
  translateSeedToPublicLifecycle,
  type PublicBusinessLifecycle,
} from './publicLifecycle.js';
import { isSeedRolledBack } from '../businessCandidate/rollback/isRolledBack.js';
import type { IngestedSeedRecord, SeedVerificationStatus } from './types.js';

export type PublicLifecycleStage = 'discovered' | 'claimed' | 'verified' | 'active';

export interface PublicBusinessProfile {
  slug: string;
  businessName: string;
  category: string | null;
  categoryLabel: string | null;
  locationLabel: string | null;
  city: string | null;
  description: string | null;
  heroImageUrl: string;
  heroVideoUrl: string | null;
  badge: string;
  publicLifecycle: PublicBusinessLifecycle;
  lifecycleLabel: string;
  lifecycleStage: PublicLifecycleStage;
  claimUrl: string;
  /** When published, public storefront URL — page may redirect here in future. */
  activeStoreUrl: string | null;
  heroImageSource: string;
  representativeImageLabel: string | null;
  mediaConfidenceSummary: string | null;
  candidateId: string | null;
  briefSummary: ReturnType<typeof briefSummaryForPublic> | null;
}

function profileLifecycleLabel(lifecycle: PublicBusinessLifecycle): string {
  switch (lifecycle) {
    case 'discovered_business':
      return 'Discovered';
    case 'verified_owner':
      return 'Verified Owner';
    case 'business_space':
      return 'Active Business Space';
    default:
      return 'Discovered';
  }
}

function lifecycleStageFromStatus(status: SeedVerificationStatus): PublicLifecycleStage {
  switch (status) {
    case 'seeded_claimable':
      return 'discovered';
    case 'verified_owner':
      return 'verified';
    case 'active':
      return 'active';
    default:
      return 'discovered';
  }
}

async function loadPublishedStoresForProfileMatch(): Promise<PublishedStoreIdentity[]> {
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

async function resolveActiveStoreUrl(
  seed: IngestedSeedRecord,
  publishedStores?: PublishedStoreIdentity[],
): Promise<string | null> {
  if (seed.storeId) {
    try {
      const prisma = getPrismaClient();
      const biz = await prisma.business.findUnique({
        where: { id: seed.storeId },
        select: { slug: true },
      });
      return biz?.slug ? `/s/${encodeURIComponent(biz.slug)}` : null;
    } catch {
      return null;
    }
  }

  const stores = publishedStores ?? (await loadPublishedStoresForProfileMatch());
  const match = findPublishedStoreForSeed(seed, stores);
  return match?.slug ? `/s/${encodeURIComponent(match.slug)}` : null;
}

export async function buildPublicBusinessProfile(
  seed: IngestedSeedRecord,
  publishedStores?: PublishedStoreIdentity[],
): Promise<PublicBusinessProfile | null> {
  if (isSeedRolledBack(seed)) return null;
  const publicLifecycle = translateSeedToPublicLifecycle(seed.verificationStatus);
  if (!publicLifecycle) return null;

  const n = seed.normalized;
  if (!n.businessName) return null;

  const canonical = resolveCanonicalLocationFromSeedNormalized(n);
  const locationLabel =
    canonical.source === 'unavailable' ? null : canonical.displayLocation;

  const candidate = await findBusinessCandidateForSeed(seed);
  const media = await resolvePublicMediaForSeed(seed);
  const slug = buildPublicBusinessSlug(seed);
  const activeStoreUrl = await resolveActiveStoreUrl(seed, publishedStores);
  const publicCategory = resolvePublicCategoryLabel(seed, candidate);

  let briefSummary = null;
  try {
    let brief =
      (media.candidateId ? await getBriefByCandidateId(media.candidateId) : null) ??
      (candidate ? await ensureIntelligenceBriefFromEnrichment(candidate, seed) : null) ??
      (await getBriefBySeedId(seed.id));
    if (!brief && seed.claimable) {
      brief = await generateBusinessIntelligenceBriefForSeed(seed);
    }
    if (brief) briefSummary = briefSummaryForPublic(brief);
  } catch (err) {
    console.warn('[publicBusinessProfile] brief generation failed:', err);
  }

  const resolvedCategoryKey = resolvePilotCategoryKey(publicCategory, n.businessName);
  const categoryLabel =
    resolvedCategoryKey !== 'unknown'
      ? resolvedCategoryKey.replace(/_/g, ' ')
      : publicCategory;

  return {
    slug,
    businessName: n.businessName,
    category: publicCategory,
    categoryLabel,
    locationLabel,
    city: canonical.suburb ?? canonical.city,
    description: resolvePublicDescription(seed, candidate, locationLabel),
    heroImageUrl: media.heroImageUrl,
    heroVideoUrl: null,
    badge: DISCOVERED_BUSINESS_BADGE,
    publicLifecycle,
    lifecycleLabel: profileLifecycleLabel(publicLifecycle),
    lifecycleStage: lifecycleStageFromStatus(seed.verificationStatus),
    claimUrl: `/activate-business/${seed.id}`,
    activeStoreUrl,
    heroImageSource: media.heroImageSource,
    representativeImageLabel: media.representativeImageLabel,
    mediaConfidenceSummary: media.mediaConfidenceSummary,
    candidateId: media.candidateId,
    briefSummary,
  };
}

export async function getPublicBusinessProfileBySlug(
  slug: string,
): Promise<PublicBusinessProfile | null> {
  const seeds = await listSeedRecords();
  const seed = findSeedByPublicSlug(seeds, slug);
  if (!seed) return null;
  const publishedStores = await loadPublishedStoresForProfileMatch();
  return buildPublicBusinessProfile(seed, publishedStores);
}
