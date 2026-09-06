/**
 * Select best media for a candidate — business-specific over category representative.
 */

import type { BusinessCandidateRecord } from '../types.js';
import type { CandidateMediaAsset, SelectedCandidateMedia } from './types.js';
import {
  categoryAllowsAsset,
  resolvePilotCategoryKey,
  type PilotCategoryKey,
} from './categoryMediaVocabulary.js';
import { listMediaForCandidate } from './mediaEvidenceRepository.js';
import { runMediaDiscoveryForCandidate } from './mediaDiscoveryAgent.js';

const SOURCE_PRIORITY: Record<CandidateMediaAsset['sourceType'], number> = {
  owner_uploaded: 100,
  official_site: 90,
  provider_photo: 85,
  social: 75,
  storefront: 70,
  category_stock: 30,
  ai_generated: 20,
};

function scoreAsset(asset: CandidateMediaAsset, categoryKey: PilotCategoryKey): number {
  if (asset.licenseStatus === 'prohibited' || asset.usageStatus === 'blocked') return -1;

  const assetCat = (asset.evidenceJson.categoryKey as PilotCategoryKey | undefined) ?? categoryKey;
  if (!categoryAllowsAsset(categoryKey, assetCat) && asset.sourceType === 'category_stock') {
    return -1;
  }

  let score = SOURCE_PRIORITY[asset.sourceType] ?? 0;
  // Raw Places photo URLs are not browser-renderable without a proxy — never pick as hero.
  if (
    asset.sourceType === 'provider_photo' &&
    (String(asset.url).includes('maps.googleapis.com/maps/api/place/photo') ||
      /places\.googleapis\.com\/v1\/places\//i.test(String(asset.url)))
  ) {
    return -1;
  }
  score += asset.matchConfidence * 30;
  score += asset.businessSpecificConfidence * 40;
  score += asset.categoryMatchConfidence * 20;
  if (asset.isRepresentative) score -= 25;
  if (asset.usageStatus === 'needs_review') score -= 10;
  return score;
}

function pickBest(
  assets: CandidateMediaAsset[],
  type: CandidateMediaAsset['assetType'],
  categoryKey: PilotCategoryKey,
): CandidateMediaAsset | null {
  const candidates = assets
    .filter((a) => a.assetType === type || (type === 'hero' && a.assetType === 'representative'))
    .map((a) => ({ asset: a, score: scoreAsset(a, categoryKey) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.asset ?? null;
}

export async function selectBestCandidateMedia(
  candidateId: string,
  options: { discoverIfEmpty?: boolean } = {},
): Promise<SelectedCandidateMedia | null> {
  const { getBusinessCandidateById } = await import('../candidateRepository.js');
  const candidate = await getBusinessCandidateById(candidateId);
  if (!candidate) return null;

  let assets = await listMediaForCandidate(candidateId);
  if (!assets.length && options.discoverIfEmpty !== false) {
    assets = await runMediaDiscoveryForCandidate(candidate);
  }

  const categoryKey = resolvePilotCategoryKey(candidate.businessType);
  const usable = assets.filter(
    (a) => a.licenseStatus !== 'prohibited' && a.usageStatus !== 'blocked',
  );

  const heroImage =
    pickBest(usable, 'hero', categoryKey) ??
    pickBest(usable, 'storefront', categoryKey) ??
    pickBest(usable, 'representative', categoryKey);

  const logoImage = pickBest(usable, 'logo', categoryKey);

  const galleryImages = usable
    .filter((a) => a.id !== heroImage?.id && a.id !== logoImage?.id)
    .slice(0, 6);

  const missingMediaReasons: string[] = [];
  if (!logoImage) missingMediaReasons.push('No verified logo');
  if (!usable.some((a) => a.businessSpecificConfidence >= 0.6 && !a.isRepresentative)) {
    missingMediaReasons.push('No business-specific images confirmed');
  }
  if (!candidate.website) missingMediaReasons.push('No website on file');

  const representativeDisclosureRequired = Boolean(
    heroImage?.isRepresentative || heroImage?.sourceType === 'category_stock',
  );

  const confidenceSummary = representativeDisclosureRequired
    ? 'Representative category image — owner verification recommended'
    : heroImage
      ? `Business-relevant media (${heroImage.sourceLabel ?? heroImage.sourceType})`
      : 'No approved media available';

  return {
    heroImage,
    logoImage,
    galleryImages,
    confidenceSummary,
    missingMediaReasons,
    representativeDisclosureRequired,
  };
}

export async function selectBestMediaForSeed(seedId: string): Promise<SelectedCandidateMedia | null> {
  const { listBusinessCandidates } = await import('../candidateRepository.js');
  const all = await listBusinessCandidates();
  const candidate = all.find((c) => c.seedId === seedId);
  if (!candidate) return null;
  return selectBestCandidateMedia(candidate.id);
}
