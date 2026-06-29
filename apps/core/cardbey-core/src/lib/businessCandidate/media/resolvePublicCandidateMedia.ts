/**
 * Resolve hero media for public discovery surfaces from candidate evidence.
 */

import type { IngestedSeedRecord } from '../../businessIngestion/types.js';
import { resolveDiscoveryCardHero, type DiscoveryHeroSource } from '../../businessIngestion/DiscoveryCardHeroResolver.js';
import { getBusinessCandidateBySeedId } from '../candidateRepository.js';
import { selectBestCandidateMedia } from './selectBestCandidateMedia.js';

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

export async function resolvePublicMediaForSeed(
  seed: IngestedSeedRecord,
): Promise<PublicCandidateMediaResolution> {
  const candidate = await getBusinessCandidateBySeedId(seed.id);
  if (!candidate) {
    const fallback = resolveDiscoveryCardHero(seed);
    return {
      heroImageUrl: fallback.heroImageUrl,
      heroImageSource: fallback.heroImageSource,
      representativeDisclosureRequired: fallback.heroImageSource === 'generic',
      representativeImageLabel:
        fallback.heroImageSource === 'generic' || fallback.heroImageSource === 'category_template'
          ? REPRESENTATIVE_LABEL
          : null,
      mediaConfidenceSummary: null,
      candidateId: null,
    };
  }

  const selected = await selectBestCandidateMedia(candidate.id);
  if (!selected?.heroImage) {
    const fallback = resolveDiscoveryCardHero(seed);
    return {
      heroImageUrl: fallback.heroImageUrl,
      heroImageSource: fallback.heroImageSource,
      representativeDisclosureRequired: true,
      representativeImageLabel: REPRESENTATIVE_LABEL,
      mediaConfidenceSummary: selected?.confidenceSummary ?? null,
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
