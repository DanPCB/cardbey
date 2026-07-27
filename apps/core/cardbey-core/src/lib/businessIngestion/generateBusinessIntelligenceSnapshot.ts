/**
 * Phase V3 — rules-based Business Intelligence Snapshot V1.
 * No external LLM dependency. Informational only.
 */

import { randomUUID } from 'node:crypto';
import type {
  BusinessIntelligenceRecommendedAction,
  BusinessIntelligenceSnapshot,
  EnrichmentCandidate,
  IngestedSeedRecord,
} from './types.js';
import { resolveDiscoveryCardHero } from './DiscoveryCardHeroResolver.js';

type SnapshotSignals = {
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
  hasBusinessName: boolean;
};

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function candidateByField(
  candidates: EnrichmentCandidate[],
  field: EnrichmentCandidate['field'],
): EnrichmentCandidate | undefined {
  return candidates.find((c) => c.field === field && c.status !== 'rejected');
}

function buildSignals(seed: IngestedSeedRecord, candidates: EnrichmentCandidate[]): SnapshotSignals {
  const n = seed.normalized;
  const hero = resolveDiscoveryCardHero(seed);
  const hasCustomHero = hero.heroImageSource !== 'generic';

  return {
    hasBusinessName: Boolean(n.businessName?.trim()),
    hasWebsite: Boolean(n.website?.trim()),
    hasPhone: Boolean(n.phone?.trim()),
    hasAddress: Boolean(n.address?.trim()),
    hasHours: Boolean(candidateByField(candidates, 'opening_hours')),
    hasLogo: Boolean(candidateByField(candidates, 'logo')),
    hasHero: hasCustomHero || Boolean(candidateByField(candidates, 'hero_image')),
    hasCategory: Boolean(n.category?.trim()),
    hasDescription: Boolean(candidateByField(candidates, 'description')),
    hasEmail: Boolean(n.email?.trim()),
    hasSocial: Boolean(candidateByField(candidates, 'social_links')),
  };
}

function scoreVisibility(signals: SnapshotSignals): number {
  let score = 0;
  if (signals.hasWebsite) score += 20;
  if (signals.hasPhone) score += 20;
  if (signals.hasAddress) score += 20;
  if (signals.hasHours) score += 15;
  if (signals.hasLogo) score += 12.5;
  if (signals.hasHero) score += 12.5;
  return clampScore(score);
}

function scoreCompleteness(signals: SnapshotSignals): number {
  let score = 0;
  if (signals.hasBusinessName) score += 15;
  if (signals.hasCategory) score += 15;
  if (signals.hasAddress) score += 15;
  if (signals.hasPhone) score += 15;
  if (signals.hasWebsite) score += 15;
  if (signals.hasDescription) score += 15;
  if (signals.hasEmail) score += 10;
  return clampScore(score);
}

function scoreEngagementReadiness(signals: SnapshotSignals): number {
  let score = 0;
  if (signals.hasWebsite && signals.hasCategory) score += 25;
  if (signals.hasSocial) score += 25;
  if (signals.hasHero) score += 20;
  if (signals.hasDescription) score += 15;
  if (signals.hasHours) score += 15;
  return clampScore(score);
}

function buildStrengths(signals: SnapshotSignals): string[] {
  const items: string[] = [];
  if (signals.hasWebsite) items.push('Website present');
  if (signals.hasPhone && signals.hasAddress) items.push('Complete contact details');
  if (signals.hasCategory) items.push('Category identified');
  if (signals.hasHours) items.push('Opening hours available');
  if (signals.hasHero) items.push('Visual presence on file');
  if (signals.hasSocial) items.push('Social presence detected');
  if (!items.length) items.push('Business identity discovered');
  return items.slice(0, 5);
}

function buildWeaknesses(signals: SnapshotSignals): string[] {
  const items: string[] = [];
  if (!signals.hasDescription) items.push('No promotional description');
  if (!signals.hasHero && !signals.hasLogo) items.push('Limited visual branding');
  if (!signals.hasSocial) items.push('No social presence detected');
  if (!signals.hasHours) items.push('Opening hours not available');
  if (!signals.hasEmail) items.push('No business email on file');
  return items.slice(0, 5);
}

function buildOpportunities(signals: SnapshotSignals): string[] {
  const items: string[] = ['Launch welcome offer', 'Enable AI Performer'];
  if (!signals.hasHero) items.push('Create promotional video');
  if (!signals.hasDescription) items.push('Publish first promotion');
  if (signals.hasWebsite) items.push('Review AI recommendations');
  if (signals.hasSocial) items.push('Connect social campaigns');
  return [...new Set(items)].slice(0, 5);
}

function buildRisks(signals: SnapshotSignals, seed: IngestedSeedRecord): string[] {
  const items: string[] = [];
  if (!signals.hasWebsite) items.push('Low discoverability without website');
  if (!signals.hasPhone) items.push('Customers may not reach you by phone');
  if (seed.qualityScore < 60) items.push('Profile quality needs review');
  if (!signals.hasCategory) items.push('Category unclear for local discovery');
  return items.slice(0, 4);
}

function buildRecommendedActions(): BusinessIntelligenceRecommendedAction[] {
  return [
    { rank: 1, label: 'Activate Business Space', proposedAction: 'activate_business_space' },
    { rank: 2, label: 'Review AI recommendations', proposedAction: 'review_bi_recommendations' },
    { rank: 3, label: 'Publish first promotion', proposedAction: 'create_first_offer' },
  ];
}

function buildSummary(
  name: string,
  visibility: number,
  completeness: number,
  engagement: number,
  strengths: string[],
  opportunities: string[],
): string {
  return (
    `We analyzed ${name}. Visibility ${visibility}/100, completeness ${completeness}/100, ` +
    `engagement readiness ${engagement}/100. ` +
    `${strengths.length} strength${strengths.length === 1 ? '' : 's'} and ` +
    `${opportunities.length} opportunit${opportunities.length === 1 ? 'y' : 'ies'} identified.`
  );
}

export function generateBusinessIntelligenceSnapshot(
  seed: IngestedSeedRecord,
  candidates: EnrichmentCandidate[] = [],
): BusinessIntelligenceSnapshot {
  const signals = buildSignals(seed, candidates);
  const visibilityScore = scoreVisibility(signals);
  const completenessScore = scoreCompleteness(signals);
  const engagementReadinessScore = scoreEngagementReadiness(signals);
  const strengths = buildStrengths(signals);
  const weaknesses = buildWeaknesses(signals);
  const opportunities = buildOpportunities(signals);
  const risks = buildRisks(signals, seed);
  const recommendedActions = buildRecommendedActions();
  const name = seed.normalized.businessName ?? 'your business';

  const confidenceScore = clampScore(
    (seed.normalized.confidenceScore ?? 0.5) * 40 +
      (seed.qualityScore / 100) * 40 +
      (visibilityScore / 100) * 20,
  );

  return {
    snapshotId: randomUUID(),
    seedId: seed.id,
    createdAt: new Date().toISOString(),
    version: 'v1',
    visibilityScore,
    completenessScore,
    engagementReadinessScore,
    strengths,
    weaknesses,
    opportunities,
    risks,
    recommendedActions,
    confidenceScore,
    summary: buildSummary(name, visibilityScore, completenessScore, engagementReadinessScore, strengths, opportunities),
  };
}
