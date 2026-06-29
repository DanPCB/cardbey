/**
 * Media Discovery Agent — gathers business-relevant media evidence for candidates.
 * Never scrapes prohibited sources; provider/website metadata only.
 */

import { randomUUID } from 'node:crypto';
import type { BusinessCandidateRecord } from '../types.js';
import type { CandidateMediaAsset } from './types.js';
import {
  categoryRepresentativeHeroUrl,
  resolvePilotCategoryKey,
} from './categoryMediaVocabulary.js';
import { listMediaForCandidate, upsertMediaAssets } from './mediaEvidenceRepository.js';

function usable(asset: CandidateMediaAsset): boolean {
  if (asset.licenseStatus === 'prohibited') return false;
  if (asset.usageStatus === 'blocked') return false;
  return true;
}

function buildProviderPhotoAsset(candidate: BusinessCandidateRecord): CandidateMediaAsset | null {
  const raw = candidate.rawSourceJson;
  if (!raw || typeof raw !== 'object') return null;

  const photos = Array.isArray((raw as { photos?: unknown }).photos)
    ? (raw as { photos: Array<{ photo_reference?: string; html_attributions?: string[] }> }).photos
    : [];

  const photoRef = photos[0]?.photo_reference;
  if (!photoRef && !candidate.sourceUrl) return null;

  const url =
    candidate.sourceUrl ??
    (photoRef
      ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${encodeURIComponent(photoRef)}`
      : null);

  if (!url) return null;

  return {
    id: randomUUID(),
    candidateId: candidate.id,
    seedId: candidate.seedId,
    assetType: 'storefront',
    url,
    thumbnailUrl: url,
    sourceProvider: candidate.discoveryProviderId,
    sourceUrl: candidate.sourceUrl,
    sourceLabel: 'Provider business photo',
    sourceType: 'provider_photo',
    matchConfidence: 0.75,
    categoryMatchConfidence: 0.7,
    businessSpecificConfidence: 0.8,
    isRepresentative: false,
    licenseStatus: 'needs_review',
    usageStatus: 'needs_review',
    evidenceJson: { placeId: candidate.placeId, provider: candidate.discoveryProviderId },
    createdAt: new Date().toISOString(),
  };
}

function buildCategoryRepresentativeAsset(candidate: BusinessCandidateRecord): CandidateMediaAsset {
  const categoryKey = resolvePilotCategoryKey(candidate.businessType);
  const url = categoryRepresentativeHeroUrl(categoryKey);

  return {
    id: randomUUID(),
    candidateId: candidate.id,
    seedId: candidate.seedId,
    assetType: 'representative',
    url,
    thumbnailUrl: url,
    sourceProvider: 'cardbey_category_library',
    sourceUrl: null,
    sourceLabel: `Representative ${categoryKey.replace(/_/g, ' ')} image`,
    sourceType: 'category_stock',
    matchConfidence: 0.4,
    categoryMatchConfidence: 0.9,
    businessSpecificConfidence: 0.1,
    isRepresentative: true,
    licenseStatus: 'allowed',
    usageStatus: 'approved',
    evidenceJson: { categoryKey, disclaimer: 'representative_until_owner_verifies' },
    createdAt: new Date().toISOString(),
  };
}

function mapFetchedImages(candidate: BusinessCandidateRecord): CandidateMediaAsset[] {
  return candidate.fetchedImages.map((img, i) => ({
    id: randomUUID(),
    candidateId: candidate.id,
    seedId: candidate.seedId,
    assetType: (img.label === 'logo' ? 'logo' : 'hero') as CandidateMediaAsset['assetType'],
    url: img.url,
    thumbnailUrl: img.url,
    sourceProvider: candidate.discoveryProviderId,
    sourceUrl: candidate.sourceUrl,
    sourceLabel: img.label ?? `Image ${i + 1}`,
    sourceType:
      img.provenance.source === 'USER_UPLOADED' || img.provenance.source === 'ORIGINAL'
        ? 'owner_uploaded'
        : img.provenance.source === 'WEBSITE'
          ? 'official_site'
          : img.provenance.source === 'SOCIAL'
            ? 'social'
            : img.provenance.isDemo
              ? 'ai_generated'
              : 'provider_photo',
    matchConfidence: img.provenance.isDemo ? 0.3 : 0.85,
    categoryMatchConfidence: 0.8,
    businessSpecificConfidence: img.provenance.isDemo ? 0.2 : 0.85,
    isRepresentative: Boolean(img.provenance.isDemo),
    licenseStatus: img.provenance.isDemo ? 'needs_review' : 'allowed',
    usageStatus: img.provenance.isDemo ? 'needs_review' : 'approved',
    evidenceJson: { provenance: img.provenance },
    createdAt: new Date().toISOString(),
  }));
}

export async function runMediaDiscoveryForCandidate(
  candidate: BusinessCandidateRecord,
): Promise<CandidateMediaAsset[]> {
  const discovered: CandidateMediaAsset[] = [];

  discovered.push(...mapFetchedImages(candidate));

  const providerPhoto = buildProviderPhotoAsset(candidate);
  if (providerPhoto) discovered.push(providerPhoto);

  const hasBusinessSpecific = discovered.some(
    (a) => usable(a) && a.businessSpecificConfidence >= 0.6 && !a.isRepresentative,
  );
  if (!hasBusinessSpecific) {
    discovered.push(buildCategoryRepresentativeAsset(candidate));
  }

  const existing = await listMediaForCandidate(candidate.id);
  const existingUrls = new Set(existing.map((e) => e.url));
  const novel = discovered.filter((d) => !existingUrls.has(d.url));

  if (novel.length) {
    await upsertMediaAssets(novel);
  }

  return [...existing, ...novel];
}
