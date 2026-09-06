/**
 * Copy enriched BusinessCandidate profile onto a promoted BusinessSeed before QA approve.
 * Promotion via DiscoveryPromotionPipeline does not map enrichment fields — seeds start
 * without hero and fail canPromoteToClaimable (HERO_MISSING) even when the candidate has media.
 */

import type { IngestedSeedRecord } from '../businessIngestion/types.js';
import { QA_FLAG_HERO_MISSING } from '../businessIngestion/QaQualityGates.js';
import { HERO_MIN_HEIGHT, HERO_MIN_WIDTH } from '../ingestion/computeSeedCompleteness.js';
import { persistSeedCompletenessOnRecord } from '../ingestion/persistSeedCompleteness.js';
import type { BusinessCandidateRecord } from './types.js';
import type { CandidateMediaAsset } from './media/types.js';

type SeedHeroProvenance = 'admin_curated' | 'website_extraction' | 'social_og' | 'stock_fallback';

function mapHeroProvenance(raw: string | null | undefined): SeedHeroProvenance | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (
    value === 'admin_curated' ||
    value === 'website_extraction' ||
    value === 'social_og' ||
    value === 'stock_fallback'
  ) {
    return value;
  }
  if (
    value === 'owner_website_og_image' ||
    value === 'og_image' ||
    value === 'website' ||
    value === 'business_website' ||
    value === 'official_site'
  ) {
    return 'website_extraction';
  }
  if (value === 'social' || value === 'instagram_og') return 'social_og';
  if (value === 'stock' || value === 'pexels' || value === 'pixabay' || value === 'unsplash') {
    return 'stock_fallback';
  }
  if (value === 'provider_photo' || value === 'storefront' || value === 'owner_uploaded') {
    return 'admin_curated';
  }
  return null;
}

function mapMediaSourceType(sourceType: CandidateMediaAsset['sourceType']): SeedHeroProvenance {
  if (sourceType === 'official_site' || sourceType === 'social') return 'website_extraction';
  if (sourceType === 'category_stock' || sourceType === 'ai_generated') return 'stock_fallback';
  return 'admin_curated';
}

function heroDimensionsFromEvidence(
  evidence: Record<string, unknown>,
): { width: number; height: number } {
  const width = Number(evidence.width);
  const height = Number(evidence.height);
  return {
    width: Number.isFinite(width) && width >= HERO_MIN_WIDTH ? width : HERO_MIN_WIDTH,
    height: Number.isFinite(height) && height >= HERO_MIN_HEIGHT ? height : HERO_MIN_HEIGHT,
  };
}

export interface ResolvedSeedHero {
  url: string;
  width: number;
  height: number;
  provenance: SeedHeroProvenance;
  visualSource: string;
}

export async function resolveHeroForSeedPromotion(
  candidate: BusinessCandidateRecord,
): Promise<ResolvedSeedHero | null> {
  const directUrl = candidate.heroImageUrl?.trim();
  if (directUrl) {
    return {
      url: directUrl,
      width: HERO_MIN_WIDTH,
      height: HERO_MIN_HEIGHT,
      provenance: mapHeroProvenance(candidate.heroImageSource) ?? 'admin_curated',
      visualSource: candidate.heroImageSource?.trim() || 'candidate_enrichment',
    };
  }

  const { selectBestCandidateMedia } = await import('./media/selectBestCandidateMedia.js');
  const media = await selectBestCandidateMedia(candidate.id, { discoverIfEmpty: true });
  const asset = media?.heroImage;
  const url = asset?.url?.trim();
  if (!url) return null;

  const dims = heroDimensionsFromEvidence(asset.evidenceJson ?? {});
  return {
    url,
    width: dims.width,
    height: dims.height,
    provenance: mapHeroProvenance(asset.sourceType) ?? mapMediaSourceType(asset.sourceType),
    visualSource: asset.sourceType,
  };
}

function socialLinksFromCandidate(
  candidate: BusinessCandidateRecord,
): Record<string, string> | null {
  const links: Record<string, string> = {};
  for (const entry of candidate.socialLinks ?? []) {
    const platform = entry.platform?.trim();
    const linkUrl = entry.url?.trim();
    if (platform && linkUrl) links[platform] = linkUrl;
  }
  return Object.keys(links).length ? links : null;
}

function hoursFromCandidate(candidate: BusinessCandidateRecord): object | null {
  const raw = candidate.openingHours;
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  const text = String(raw).trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as object;
    }
  } catch {
    // fall through to summary string
  }
  return { summary: text };
}

/**
 * Merge candidate enrichment onto a freshly promoted seed and recompute completeness.
 */
export async function applyCandidateProfileToSeed(
  candidate: BusinessCandidateRecord,
  seed: IngestedSeedRecord,
): Promise<IngestedSeedRecord> {
  const hero = await resolveHeroForSeedPromotion(candidate);
  const socialLinks = socialLinksFromCandidate(candidate);
  const hours = hoursFromCandidate(candidate);

  const enrichmentProfile = {
    ...(seed.enrichmentProfile ?? {}),
    description: candidate.description ?? seed.enrichmentProfile?.description ?? null,
    logoUrl: candidate.logoUrl ?? seed.enrichmentProfile?.logoUrl ?? null,
    heroImageUrl: hero?.url ?? seed.enrichmentProfile?.heroImageUrl ?? null,
    heroWidth: hero?.width ?? seed.enrichmentProfile?.heroWidth ?? null,
    heroHeight: hero?.height ?? seed.enrichmentProfile?.heroHeight ?? null,
    visualSource: hero?.visualSource ?? seed.enrichmentProfile?.visualSource ?? null,
    fetchedMenu: candidate.fetchedMenu ?? seed.enrichmentProfile?.fetchedMenu ?? null,
    enrichedAt:
      candidate.enrichedAt ??
      candidate.enrichmentUpdatedAt ??
      seed.enrichmentProfile?.enrichedAt ??
      new Date().toISOString(),
  };

  const patched: IngestedSeedRecord = {
    ...seed,
    tagline: candidate.tagline ?? seed.tagline ?? null,
    about: candidate.description ?? seed.about ?? null,
    hours: hours ?? seed.hours ?? null,
    socialLinks: socialLinks ?? seed.socialLinks ?? null,
    enrichmentProfile,
    hero: hero
      ? {
          url: hero.url,
          width: hero.width,
          height: hero.height,
          provenance: hero.provenance,
          isLogoSuspect: false,
        }
      : seed.hero ?? null,
    qaFlags: (seed.qaFlags ?? []).filter((flag) => flag !== QA_FLAG_HERO_MISSING),
  };

  const normalized = { ...seed.normalized };
  let normalizedChanged = false;
  const fillNorm = (key: keyof typeof normalized, value: string | null | undefined) => {
    const next = typeof value === 'string' ? value.trim() : '';
    const cur = typeof normalized[key] === 'string' ? String(normalized[key]).trim() : '';
    if (next && !cur) {
      (normalized as Record<string, unknown>)[key as string] = next;
      normalizedChanged = true;
    }
  };
  fillNorm('phone', candidate.phone);
  fillNorm('website', candidate.website);
  fillNorm('email', candidate.email);
  fillNorm('address', candidate.address);
  fillNorm('category', candidate.category);
  if (normalizedChanged) {
    patched.normalized = normalized;
  }

  return persistSeedCompletenessOnRecord(patched).seed;
}
