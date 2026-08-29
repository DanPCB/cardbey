/**
 * Public copy/media helpers — prefer enriched BusinessCandidate fields over seed placeholders.
 */

import type { IngestedSeedRecord } from '../../businessIngestion/types.js';
import type { DiscoveryHeroSource } from '../../businessIngestion/DiscoveryCardHeroResolver.js';
import type { BusinessCandidateRecord } from '../types.js';
import type { CandidateIntelligenceBrief } from '../brief/types.js';
import { getBriefByCandidateId, newBriefId, saveBrief } from '../brief/briefRepository.js';

const CLAIM_PLACEHOLDER_RE =
  /claim your (business )?profile|activate your cardbey business space/i;

/** Sources allowed for public hero display (never Google Places photos). */
const PUBLIC_ELIGIBLE_HERO_SOURCES = new Set(['business_website', 'pexels', 'pixabay']);

/** Representative stock — show with disclosure label on public surfaces. */
const REPRESENTATIVE_HERO_SOURCES = new Set(['pexels', 'pixabay']);

/** Google Places photo URLs require server-side API keys and break in public <img> tags. */
export function isPublicRenderableImageUrl(url: string | null | undefined): boolean {
  const text = String(url ?? '').trim();
  if (!text) return false;
  if (!text.startsWith('http://') && !text.startsWith('https://')) return false;
  if (text.includes('maps.googleapis.com/maps/api/place/photo')) return false;
  return true;
}

export function isClaimPlaceholderDescription(value: string | null | undefined): boolean {
  const text = String(value ?? '').trim();
  if (!text) return true;
  const lower = text.toLowerCase();
  if (['n/a', 'none', 'tbd', 'no description available'].includes(lower)) return true;
  // Claim CTA boilerplate — never treat as real public copy.
  // Do NOT reject short enriched copy via word-count; thin ABR/Claude text still beats this template.
  return CLAIM_PLACEHOLDER_RE.test(text);
}

export function resolvePublicDescription(
  seed: IngestedSeedRecord,
  candidate: BusinessCandidateRecord | null,
  locationLabel: string | null,
): string {
  const enriched = candidate?.description?.trim();
  if (enriched && !isClaimPlaceholderDescription(enriched)) {
    return enriched;
  }

  const seedCopy = (seed.about ?? seed.enrichmentProfile?.description)?.trim();
  if (seedCopy && !isClaimPlaceholderDescription(seedCopy)) {
    return seedCopy;
  }

  const name = seed.normalized.businessName ?? candidate?.name ?? 'This business';
  const category = resolvePublicCategoryLabel(seed, candidate);
  if (category && locationLabel) {
    return `${name} — a local ${category} in ${locationLabel}. Claim your profile to manage your storefront on Cardbey.`;
  }
  if (locationLabel) {
    return `${name} in ${locationLabel}. Claim your business profile on Cardbey.`;
  }
  return `${name}. Claim your business profile on Cardbey.`;
}

export function resolvePublicCategoryLabel(
  seed: IngestedSeedRecord,
  candidate: BusinessCandidateRecord | null,
): string | null {
  const enriched = candidate?.category?.trim();
  if (enriched && enriched.toLowerCase() !== 'other') {
    return enriched;
  }
  return seed.normalized.category ?? candidate?.businessType ?? null;
}

/**
 * Enriched heroes eligible for public display.
 * Pexels/Pixabay are allowed with representative disclosure (see resolveEnrichedHeroFromCandidate).
 * Google Places photos are never shown.
 */
export function isEligibleEnrichedHero(candidate: BusinessCandidateRecord): boolean {
  const url = candidate.heroImageUrl?.trim();
  if (!url) return false;
  const source = String(candidate.heroImageSource ?? '').trim();
  if (!source || source === 'google_places') return false;
  return PUBLIC_ELIGIBLE_HERO_SOURCES.has(source);
}

export function resolveEnrichedHeroFromCandidate(
  candidate: BusinessCandidateRecord,
): { heroImageUrl: string; heroImageSource: DiscoveryHeroSource; representativeDisclosureRequired: boolean } | null {
  if (!isEligibleEnrichedHero(candidate)) return null;
  const url = candidate.heroImageUrl!.trim();
  if (!isPublicRenderableImageUrl(url)) return null;
  const source = String(candidate.heroImageSource ?? '').trim();
  const representative = REPRESENTATIVE_HERO_SOURCES.has(source);
  return {
    heroImageUrl: url,
    heroImageSource: source === 'pexels' || source === 'pixabay' ? 'representative' : 'website',
    representativeDisclosureRequired: representative,
  };
}

/** QA-approved seed hero copied from BusinessCandidate during promotion. */
export function resolveEnrichedHeroFromSeed(
  seed: IngestedSeedRecord,
): { heroImageUrl: string; heroImageSource: DiscoveryHeroSource; representativeDisclosureRequired: boolean } | null {
  const url = (seed.hero?.url ?? seed.enrichmentProfile?.heroImageUrl)?.trim();
  if (!isPublicRenderableImageUrl(url)) return null;

  const visualSource = String(
    seed.enrichmentProfile?.visualSource ?? seed.hero?.provenance ?? '',
  ).trim();
  const representative =
    REPRESENTATIVE_HERO_SOURCES.has(visualSource) ||
    visualSource === 'stock_fallback' ||
    visualSource === 'pexels' ||
    visualSource === 'pixabay';

  return {
    heroImageUrl: url!,
    heroImageSource: representative ? 'representative' : 'website',
    representativeDisclosureRequired: representative,
  };
}

export function resolvePublicLogoUrl(
  seed: IngestedSeedRecord,
  candidate: BusinessCandidateRecord | null,
): string | null {
  const fromCandidate = candidate?.logoUrl?.trim();
  if (isPublicRenderableImageUrl(fromCandidate)) return fromCandidate!;
  const fromSeed = seed.enrichmentProfile?.logoUrl?.trim();
  if (isPublicRenderableImageUrl(fromSeed)) return fromSeed!;
  return null;
}

function firstParagraph(markdown: string): string {
  const line = markdown
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  return line ?? markdown.trim().slice(0, 280);
}

/** Materialize intelligence-briefs.json row from enrichment output when missing. */
export async function ensureIntelligenceBriefFromEnrichment(
  candidate: BusinessCandidateRecord,
  seed: IngestedSeedRecord,
): Promise<CandidateIntelligenceBrief | null> {
  if (candidate.biStatus !== 'generated') return null;
  const markdown = candidate.biBrief?.trim();
  if (!markdown) return null;

  const existing = await getBriefByCandidateId(candidate.id);
  if (existing?.generatedMarkdown?.trim()) return existing;

  const now = new Date().toISOString();
  const name = candidate.name ?? seed.normalized.businessName ?? 'Business';
  const brief: CandidateIntelligenceBrief = {
    id: existing?.id ?? newBriefId(),
    candidateId: candidate.id,
    seedId: seed.id,
    batchId: candidate.batchId,
    title: `Business Intelligence Brief — ${name}`,
    summary: firstParagraph(markdown),
    confidenceScore: Math.round((candidate.confidenceScore ?? 0.5) * 100),
    completenessScore: 55,
    evidenceJson: {
      sourceProvider: candidate.discoveryProviderId ?? 'enrichment',
      enrichmentSources: candidate.enrichmentSources ?? [],
      evidenceFound: candidate.enrichmentSources ?? [],
    },
    missingFieldsJson: candidate.missingFields ?? [],
    recommendedActionsJson: [
      {
        label: 'Claim and verify your business profile',
        reason: 'Owner verification unlocks full storefront management on Cardbey.',
      },
    ],
    mediaSummaryJson: {
      heroSource: candidate.heroImageSource ?? 'missing',
      representativeDisclosureRequired: REPRESENTATIVE_HERO_SOURCES.has(
        String(candidate.heroImageSource ?? '').trim(),
      ),
    },
    visibility: {
      overall: 45,
      seoReadiness: 40,
      geoReadiness: 35,
      onlinePresence: 45,
      profileCompleteness: 55,
      confidenceLevel: 'medium',
    },
    visibilityEstimate: {
      seoReadiness: { current: 40, estimatedAfterClaim: 75 },
      geoReadiness: { current: 35, estimatedAfterClaim: 70 },
      profileCompleteness: { current: 55, estimatedAfterClaim: 85 },
      overall: { current: 45, estimatedAfterClaim: 80 },
      overallReadiness: { current: 45, estimatedAfterClaim: 80 },
      disclaimer:
        'Estimates are directional only and based on publicly available information.',
    },
    healthScore: {
      overallReadiness: 50,
      confidenceLevel: 'medium',
      pillars: [],
    },
    strengths: ['Multi-source enrichment completed'],
    weaknesses: candidate.missingFields?.length
      ? candidate.missingFields.map((f) => `Missing ${f}`)
      : ['Some fields still require owner verification'],
    seoExplanation:
      'Search Engine Optimization (SEO) helps customers find your business through Google and other search engines.',
    geoExplanation:
      'Generative Engine Optimization (GEO) helps AI assistants understand and recommend your business accurately.',
    disclaimer:
      'This brief is generated from publicly available or provider-supplied information and should be verified by the business owner.',
    generatedMarkdown: markdown,
    generatedHtml: null,
    generatedPdfUrl: null,
    status: 'ready',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    downloadedAt: existing?.downloadedAt ?? null,
    claimStartedAt: existing?.claimStartedAt ?? null,
  };

  await saveBrief(brief);
  return brief;
}
