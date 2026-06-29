/**
 * Resolve hero media for public discovery surfaces from candidate evidence.
 */

import type { IngestedSeedRecord } from '../../businessIngestion/types.js';
import type { DiscoveryHeroSource } from '../../businessIngestion/DiscoveryCardHeroResolver.js';
import { getBusinessCandidateBySeedId } from '../candidateRepository.js';
import { selectBestCandidateMedia } from './selectBestCandidateMedia.js';
import { resolveSeedRepresentativeHero } from './resolveSeedRepresentativeHero.js';

export interface PublicCandidateMediaResolution {
  heroImageUrl: string;
  heroImageSource: DiscoveryHeroSource | 'provider_photo' | 'representative' | 'owner_uploaded';
  representativeDisclosureRequired: boolean;
  representativeImageLabel: string | null;
  mediaConfidenceSummary: string | null;
  candidateId: string | null;
}

const REPRESENTATIVE_LABEL =
  'Representative image shown until the owner verifies this business.';

function seedRepresentativeFallback(seed: IngestedSeedRecord): PublicCandidateMediaResolution {
  const { heroImageUrl, categoryKey } = resolveSeedRepresentativeHero(seed);
  return {
    heroImageUrl,
    heroImageSource: 'representative',
    representativeDisclosureRequired: true,
    representativeImageLabel: REPRESENTATIVE_LABEL,
    mediaConfidenceSummary:
      categoryKey !== 'unknown'
        ? `Representative ${categoryKey.replace(/_/g, ' ')} image from public business profile`
        : 'Representative image until owner verifies',
    candidateId: null,
  };
}

export async function resolvePublicMediaForSeed(
  seed: IngestedSeedRecord,
): Promise<PublicCandidateMediaResolution> {
  const candidate = await getBusinessCandidateBySeedId(seed.id);
  if (!candidate) {
    return seedRepresentativeFallback(seed);
  }

  const selected = await selectBestCandidateMedia(candidate.id);
  if (!selected?.heroImage) {
    const fallback = seedRepresentativeFallback(seed);
    return {
      ...fallback,
      mediaConfidenceSummary: selected?.confidenceSummary ?? fallback.mediaConfidenceSummary,
      candidateId: candidate.id,
    };
  }

  const hero = selected.heroImage;
  const sourceMap: Record<string, PublicCandidateMediaResolution['heroImageSource']> = {
    owner_uploaded: 'owner_uploaded',
    official_site: 'website',
    provider_photo: 'provider_photo',
    social: 'social_profile',
    storefront: 'provider_photo',
    category_stock: 'representative',
    ai_generated: 'representative',
  };

  return {
    heroImageUrl: hero.url,
    heroImageSource: sourceMap[hero.sourceType] ?? 'category_template',
    representativeDisclosureRequired: selected.representativeDisclosureRequired,
    representativeImageLabel: selected.representativeDisclosureRequired
      ? REPRESENTATIVE_LABEL
      : null,
    mediaConfidenceSummary: selected.confidenceSummary,
    candidateId: candidate.id,
  };
}
