/**
 * Phase V4 — compute current business scores from live store state (read-only).
 */

import type { BusinessEvolutionScorecard } from './types.js';

export type CurrentBusinessSignals = {
  hasWebsite: boolean;
  hasPhone: boolean;
  hasAddress: boolean;
  hasHours: boolean;
  hasLogo: boolean;
  hasHero: boolean;
  hasCategory: boolean;
  hasDescription: boolean;
  hasEmail: boolean;
  hasSocial: boolean;
  hasOffers: boolean;
  hasCampaigns: boolean;
  hasLoyalty: boolean;
  hasContent: boolean;
  hasVideo: boolean;
  hasDevices: boolean;
  profileCompleteness: number;
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function trim(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function hasSocialLinks(links: unknown): boolean {
  if (!links || typeof links !== 'object') return false;
  return Object.values(links as Record<string, unknown>).some(
    (v) => typeof v === 'string' && v.trim().length > 0,
  );
}

export function buildCurrentBusinessSignals(input: {
  store?: Record<string, unknown> | null;
  draft?: Record<string, unknown> | null;
  activeOfferCount?: number;
  activeCampaignCount?: number;
  loyaltyProgramCount?: number;
  contentDocumentCount?: number;
  screenCount?: number;
  profileCompleteness?: number;
}): CurrentBusinessSignals {
  const store = input.store ?? {};
  const draft = input.draft ?? {};
  const heroImageUrl =
    trim(draft.heroImageUrl) || trim(store.heroImageUrl) || trim((draft.hero as { imageUrl?: string })?.imageUrl);
  const heroVideoUrl =
    trim(draft.heroVideoUrl) || trim(store.heroVideoUrl) || trim(draft.heroVideo);

  return {
    hasWebsite: Boolean(trim(store.website) || trim(draft.website)),
    hasPhone: Boolean(trim(store.phone) || trim(draft.phone)),
    hasAddress: Boolean(trim(store.address) || trim(draft.address)),
    hasHours: Boolean(trim(draft.openingHours) || trim(store.openingHours)),
    hasLogo: Boolean(trim(store.logo) || trim(draft.logo)),
    hasHero: Boolean(heroImageUrl),
    hasCategory: Boolean(trim(store.type) || trim(store.category) || trim(draft.type) || trim(draft.category)),
    hasDescription: Boolean(trim(store.description) || trim(draft.description)),
    hasEmail: Boolean(trim(store.email) || trim(draft.email)),
    hasSocial: hasSocialLinks(store.socialLinks) || hasSocialLinks(draft.socialLinks),
    hasOffers: (input.activeOfferCount ?? 0) > 0,
    hasCampaigns: (input.activeCampaignCount ?? 0) > 0,
    hasLoyalty: (input.loyaltyProgramCount ?? 0) > 0,
    hasContent: (input.contentDocumentCount ?? 0) > 0,
    hasVideo: Boolean(heroVideoUrl),
    hasDevices: (input.screenCount ?? 0) > 0,
    profileCompleteness: clamp(input.profileCompleteness ?? 0),
  };
}

export function scorecardFromSignals(signals: CurrentBusinessSignals): BusinessEvolutionScorecard {
  let visibility = 0;
  if (signals.hasWebsite) visibility += 20;
  if (signals.hasPhone) visibility += 20;
  if (signals.hasAddress) visibility += 20;
  if (signals.hasHours) visibility += 15;
  if (signals.hasLogo) visibility += 12.5;
  if (signals.hasHero) visibility += 12.5;

  const completeness = signals.profileCompleteness;

  let engagement = 0;
  if (signals.hasOffers) engagement += 25;
  if (signals.hasLoyalty) engagement += 25;
  if (signals.hasVideo || signals.hasContent) engagement += 20;
  if (signals.hasCampaigns) engagement += 15;
  if (signals.hasSocial) engagement += 15;

  let distribution = 0;
  if (signals.hasWebsite) distribution += 25;
  if (signals.hasSocial) distribution += 20;
  if (signals.hasCampaigns) distribution += 20;
  if (signals.hasDevices) distribution += 20;
  if (signals.hasOffers) distribution += 15;

  return {
    visibilityScore: clamp(visibility),
    completenessScore: clamp(completeness),
    engagementReadinessScore: clamp(engagement),
    distributionCoverage: clamp(distribution),
  };
}

export function deltaScorecard(
  baseline: BusinessEvolutionScorecard,
  current: BusinessEvolutionScorecard,
): BusinessEvolutionScorecard {
  return {
    visibilityScore: current.visibilityScore - baseline.visibilityScore,
    completenessScore: current.completenessScore - baseline.completenessScore,
    engagementReadinessScore: current.engagementReadinessScore - baseline.engagementReadinessScore,
    distributionCoverage: current.distributionCoverage - baseline.distributionCoverage,
  };
}
