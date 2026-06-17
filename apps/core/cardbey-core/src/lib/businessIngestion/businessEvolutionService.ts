/**
 * Phase V4 — Business Evolution (before/after) read-only service.
 */

import { getPrismaClient } from '../prisma.js';
import { getSeedRecordById, listSeedRecords } from './IngestionRepository.js';
import { getSeedSuitcase, listAllSeedSuitcases, saveSeedSuitcase } from './seedSuitcaseStore.js';
import {
  buildCurrentBusinessSignals,
  deltaScorecard,
  scorecardFromSignals,
} from './computeCurrentBusinessScores.js';
import type {
  BusinessEvolutionRecommendedAction,
  BusinessEvolutionSnapshot,
  BusinessEvolutionTimelineEvent,
  BusinessIntelligenceSnapshot,
  DiscoveryIntelligenceMetrics,
  SeedSuitcase,
} from './types.js';

function baselineScorecard(snapshot: BusinessIntelligenceSnapshot) {
  return {
    visibilityScore: snapshot.visibilityScore,
    completenessScore: snapshot.completenessScore,
    engagementReadinessScore: snapshot.engagementReadinessScore,
    distributionCoverage: 0,
  };
}

function computeProfileCompleteness(store: Record<string, unknown>, catalogCount: number): number {
  const checks = [
    Boolean(String(store.name ?? '').trim()),
    Boolean(String(store.description ?? '').trim()),
    Boolean(String(store.phone ?? '').trim()),
    Boolean(String(store.address ?? '').trim()),
    Boolean(String(store.logo ?? '').trim()),
    Boolean(String(store.heroImageUrl ?? '').trim()),
    Boolean(String(store.type ?? store.category ?? '').trim()),
    catalogCount >= 1,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function mapOpportunityToAction(label: string): string | null {
  const lower = label.toLowerCase();
  if (lower.includes('welcome offer') || lower.includes('promotion') || lower.includes('offer')) {
    return 'create_first_offer';
  }
  if (lower.includes('loyalty')) return 'create_loyalty_program';
  if (lower.includes('video') || lower.includes('content')) return 'generate_content';
  if (lower.includes('distribution') || lower.includes('channel') || lower.includes('qr')) {
    return 'boost_discovery';
  }
  if (lower.includes('performer') || lower.includes('ai')) return 'analyze_store';
  return 'create_offer';
}

function mapProposedActionToRecommendation(proposedAction: string): string {
  switch (proposedAction) {
    case 'create_first_offer':
      return 'create_offer';
    case 'create_loyalty_program':
    case 'setup_loyalty_program':
      return 'create_loyalty_program';
    case 'generate_content':
    case 'generate_content_pack':
      return 'generate_content';
    case 'launch_welcome_campaign':
    case 'launch_local_campaign':
      return 'launch_campaign';
    case 'boost_discovery':
      return 'boost_discovery';
    default:
      return 'analyze_store';
  }
}

function resolveOpportunity(
  label: string,
  signals: ReturnType<typeof buildCurrentBusinessSignals>,
): boolean {
  const lower = label.toLowerCase();
  if (lower.includes('welcome offer') || lower.includes('first promotion')) return signals.hasOffers;
  if (lower.includes('loyalty')) return signals.hasLoyalty;
  if (lower.includes('video') || lower.includes('promotional video')) {
    return signals.hasVideo || signals.hasContent;
  }
  if (lower.includes('ai performer') || lower.includes('enable ai')) return signals.hasCampaigns || signals.hasContent;
  if (lower.includes('social')) return signals.hasSocial;
  if (lower.includes('distribution') || lower.includes('channel')) {
    return signals.hasDevices || signals.hasCampaigns;
  }
  return false;
}

function buildTimeline(
  signals: ReturnType<typeof buildCurrentBusinessSignals>,
  migratedAt: string | null,
): BusinessEvolutionTimelineEvent[] {
  const baseTime = migratedAt ?? new Date().toISOString();
  return [
    {
      id: 'profile',
      label: 'Profile completed',
      completed: signals.profileCompleteness >= 70,
      completedAt: signals.profileCompleteness >= 70 ? baseTime : null,
      source: 'owner',
    },
    {
      id: 'first-offer',
      label: 'First offer created',
      completed: signals.hasOffers,
      completedAt: signals.hasOffers ? baseTime : null,
      source: 'performer',
    },
    {
      id: 'campaign',
      label: 'Campaign launched',
      completed: signals.hasCampaigns,
      completedAt: signals.hasCampaigns ? baseTime : null,
      source: 'performer',
    },
    {
      id: 'loyalty',
      label: 'Loyalty enabled',
      completed: signals.hasLoyalty,
      completedAt: signals.hasLoyalty ? baseTime : null,
      source: 'performer',
    },
    {
      id: 'content',
      label: 'Content generated',
      completed: signals.hasContent || signals.hasVideo,
      completedAt: signals.hasContent || signals.hasVideo ? baseTime : null,
      source: 'performer',
    },
    {
      id: 'devices',
      label: 'Device / QR connected',
      completed: signals.hasDevices,
      completedAt: signals.hasDevices ? baseTime : null,
      source: 'owner',
    },
  ];
}

function buildRecommendedNextActions(
  unresolved: BusinessEvolutionSnapshot['unresolvedOpportunities'],
): BusinessEvolutionRecommendedAction[] {
  const defaults: BusinessEvolutionRecommendedAction[] = [
    {
      label: 'Create first offer',
      recommendationType: 'create_offer',
      reason: 'Turn discovery interest into conversions.',
    },
    {
      label: 'Launch loyalty',
      recommendationType: 'create_loyalty_program',
      reason: 'Reward repeat customers and increase retention.',
    },
    {
      label: 'Generate promo video',
      recommendationType: 'generate_content',
      reason: 'Improve engagement with visual promotion.',
    },
    {
      label: 'Connect distribution channel',
      recommendationType: 'boost_discovery',
      reason: 'Expand reach across physical and digital channels.',
    },
  ];

  if (!unresolved.length) return defaults.slice(0, 2);

  return unresolved.slice(0, 4).map((opp) => ({
    label: opp.label,
    recommendationType: mapProposedActionToRecommendation(opp.proposedAction ?? 'create_offer'),
    reason: 'Identified in your Business Intelligence Snapshot.',
  }));
}

export async function findSeedSuitcaseByStoreId(storeId: string): Promise<SeedSuitcase | null> {
  const direct = (await listAllSeedSuitcases()).find((s) => s.migratedToStoreId === storeId);
  if (direct) return direct;
  const seeds = await listSeedRecords();
  const seed = seeds.find((s) => s.storeId === storeId);
  if (!seed) return null;
  return getSeedSuitcase(seed.id);
}

async function loadStoreEvolutionInputs(storeId: string) {
  const prisma = getPrismaClient();
  const store = await prisma.business.findUnique({ where: { id: storeId } });
  if (!store) return null;

  let draftPreview: Record<string, unknown> | null = null;
  try {
    const { getDraft } = await import('../../services/draftStore/draftStoreService.js');
    const draftRes = await getDraft(storeId);
    draftPreview =
      (draftRes?.draft?.preview as Record<string, unknown> | undefined) ??
      (draftRes?.draft as Record<string, unknown> | undefined) ??
      null;
  } catch {
    draftPreview = null;
  }

  const [productsCount, screensCount, promotions, campaigns, loyaltyPrograms, contentCount] =
    await Promise.all([
      prisma.product.count({ where: { businessId: storeId, deletedAt: null } }).catch(() => 0),
      prisma.screen.count({ where: { businessId: storeId } }).catch(() => 0),
      prisma.promotion
        .findMany({ where: { storeId }, select: { id: true, status: true } })
        .catch(() => []),
      prisma.campaignV2
        .findMany({ where: { storeId }, select: { id: true, status: true } })
        .catch(() => []),
      prisma.loyaltyProgram.findMany({ where: { storeId }, select: { id: true } }).catch(() => []),
      prisma.smartDocument.count({ where: { storeId } }).catch(() => 0),
    ]);

  const activeOffers = promotions.filter(
    (p) => String(p.status ?? '').toLowerCase() !== 'archived',
  ).length;
  const activeCampaigns = campaigns.filter((c) => {
    const status = String(c.status ?? '').toUpperCase();
    return status === 'ACTIVE' || status === 'RUNNING' || status === 'DONE';
  }).length;

  const storeRecord = store as unknown as Record<string, unknown>;
  const profileCompleteness = computeProfileCompleteness(storeRecord, productsCount);

  const signals = buildCurrentBusinessSignals({
    store: storeRecord,
    draft: draftPreview,
    activeOfferCount: activeOffers,
    activeCampaignCount: activeCampaigns,
    loyaltyProgramCount: loyaltyPrograms.length,
    contentDocumentCount: contentCount,
    screenCount: screensCount,
    profileCompleteness,
  });

  return { store, signals, migratedAt: null as string | null };
}

export async function buildBusinessEvolutionSnapshot(
  storeId: string,
): Promise<BusinessEvolutionSnapshot | null> {
  const inputs = await loadStoreEvolutionInputs(storeId);
  if (!inputs) return null;

  const suitcase = await findSeedSuitcaseByStoreId(storeId);
  const bi = suitcase?.biSnapshot ?? null;
  const baseline = bi
    ? baselineScorecard(bi)
    : {
        visibilityScore: 0,
        completenessScore: 0,
        engagementReadinessScore: 0,
        distributionCoverage: 0,
      };
  const current = scorecardFromSignals(inputs.signals);
  const deltas = deltaScorecard(baseline, current);

  const opportunities = bi?.opportunities ?? [];
  const resolvedOpportunities = opportunities.filter((label) =>
    resolveOpportunity(label, inputs.signals),
  );
  const unresolvedOpportunities = opportunities
    .filter((label) => !resolveOpportunity(label, inputs.signals))
    .map((label) => ({
      label,
      resolved: false,
      proposedAction: mapOpportunityToAction(label),
    }));

  const snapshot: BusinessEvolutionSnapshot = {
    storeId,
    seedId: suitcase?.seedId ?? null,
    baselineCapturedAt: bi?.createdAt ?? suitcase?.migratedAt ?? null,
    currentCapturedAt: new Date().toISOString(),
    hasBaseline: Boolean(bi),
    baseline,
    current,
    deltas,
    opportunityCompletion: {
      completed: resolvedOpportunities.length,
      total: opportunities.length,
    },
    timeline: buildTimeline(inputs.signals, suitcase?.migratedAt ?? null),
    resolvedOpportunities,
    unresolvedOpportunities,
    recommendedNextActions: buildRecommendedNextActions(unresolvedOpportunities),
  };

  if (suitcase && bi) {
    await saveSeedSuitcase({
      ...suitcase,
      updatedAt: new Date().toISOString(),
      lastEvolution: {
        capturedAt: snapshot.currentCapturedAt,
        visibilityDelta: deltas.visibilityScore,
        opportunityCompleted: snapshot.opportunityCompletion.completed,
        opportunityTotal: snapshot.opportunityCompletion.total,
        unresolvedOpportunityTypes: unresolvedOpportunities.map((o) => o.label),
      },
    });
  }

  return snapshot;
}

export async function buildDiscoveryIntelligenceMetrics(): Promise<DiscoveryIntelligenceMetrics> {
  const suitcases = await listAllSeedSuitcases();
  const withSnapshot = suitcases.filter((s) => s.biSnapshot);
  const viewed = withSnapshot.filter((s) => (s.reportViewCount ?? 0) > 0);
  const activatedAfterView = viewed.filter((s) => s.migratedToStoreId);
  const migrated = withSnapshot.filter((s) => s.migratedToStoreId);

  const totalViews = viewed.reduce((sum, s) => sum + (s.reportViewCount ?? 0), 0);
  const snapshotsGenerated = withSnapshot.length;

  const evolutionCaches = migrated
    .map((s) => s.lastEvolution)
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  const visibilityDeltas = evolutionCaches.map((e) => e.visibilityDelta);
  const avgVisibility =
    visibilityDeltas.length > 0
      ? Math.round(
          (visibilityDeltas.reduce((a, b) => a + b, 0) / visibilityDeltas.length) * 10,
        ) / 10
      : null;

  const completionRates = evolutionCaches
    .filter((e) => e.opportunityTotal > 0)
    .map((e) => e.opportunityCompleted / e.opportunityTotal);
  const avgCompletion =
    completionRates.length > 0
      ? Math.round(
          (completionRates.reduce((a, b) => a + b, 0) / completionRates.length) * 100,
        ) / 100
      : null;

  const unresolvedCounts = new Map<string, number>();
  for (const cache of evolutionCaches) {
    for (const label of cache.unresolvedOpportunityTypes ?? []) {
      unresolvedCounts.set(label, (unresolvedCounts.get(label) ?? 0) + 1);
    }
  }
  const topUnresolvedOpportunityTypes = [...unresolvedCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label]) => label);

  return {
    snapshotsGenerated,
    activationReportViews: totalViews,
    activationReportOpenRate:
      snapshotsGenerated > 0 ? Math.round((viewed.length / snapshotsGenerated) * 100) / 100 : null,
    activationConversionAfterReportView:
      viewed.length > 0 ? Math.round((activatedAfterView.length / viewed.length) * 100) / 100 : null,
    reportViewedSeeds: viewed.length,
    activatedAfterReportView: activatedAfterView.length,
    averageVisibilityImprovement: avgVisibility,
    averageOpportunityCompletion: avgCompletion,
    activatedBusinessesWithBiProgress: migrated.length,
    topUnresolvedOpportunityTypes,
  };
}
