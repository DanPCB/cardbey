/**
 * Phase V3 — Seed Suitcase orchestration (informational; no store mutations).
 */

import type {
  ActivationNarrative,
  BusinessIntelligenceBriefing,
  BusinessIntelligenceSnapshot,
  IngestedSeedRecord,
  PublicBusinessSnapshot,
  SeedSuitcase,
} from './types.js';
import { generateBusinessIntelligenceSnapshot } from './generateBusinessIntelligenceSnapshot.js';
import { listEnrichmentCandidates } from './EnrichmentCandidateStore.js';
import {
  getSeedSuitcase,
  listAllSeedSuitcases,
  saveSeedSuitcase,
} from './seedSuitcaseStore.js';
import { buildBusinessIntelligenceBriefing } from './biBriefing.js';

export { buildDiscoveryIntelligenceMetrics } from './businessEvolutionService.js';

function buildActivationNarrative(
  seedId: string,
  snapshot: BusinessIntelligenceSnapshot,
  businessName?: string | null,
): ActivationNarrative {
  const label = businessName?.trim() || 'your business';
  return {
    headline: `Cardbey prepared a Business Snapshot for ${label}.`,
    body:
      `We identified ${snapshot.strengths.length} strengths, ` +
      `${snapshot.opportunities.length} opportunities, and ` +
      `${snapshot.weaknesses.length} improvement area${snapshot.weaknesses.length === 1 ? '' : 's'}. ` +
      'Review your report and activate your Business Space.',
    ctaLabel: 'Review your report',
    activationPath: `/activate-business/${seedId}`,
  };
}

export function buildActivationCampaignMessage(snapshot: BusinessIntelligenceSnapshot, seedId: string): string {
  const narrative = buildActivationNarrative(seedId, snapshot);
  return `${narrative.headline}\n\n${narrative.body}\n\n${narrative.activationPath}`;
}

export function toPublicBusinessSnapshot(
  snapshot: BusinessIntelligenceSnapshot,
  seedId: string,
): PublicBusinessSnapshot {
  return {
    visibilityScore: snapshot.visibilityScore,
    completenessScore: snapshot.completenessScore,
    engagementReadinessScore: snapshot.engagementReadinessScore,
    strengths: snapshot.strengths,
    weaknesses: snapshot.weaknesses,
    opportunities: snapshot.opportunities,
    recommendedActions: snapshot.recommendedActions.map((a) => a.label),
    summary: snapshot.summary,
    campaignMessage: buildActivationCampaignMessage(snapshot, seedId),
  };
}

function buildOpportunityAnalysis(snapshot: BusinessIntelligenceSnapshot): string[] {
  return [
    ...snapshot.opportunities.map((o) => `Opportunity: ${o}`),
    ...snapshot.risks.map((r) => `Risk: ${r}`),
  ];
}

export async function generateAndStoreBiSnapshotForSeed(
  seed: IngestedSeedRecord,
): Promise<{ ok: boolean; snapshot: BusinessIntelligenceSnapshot | null; suitcase: SeedSuitcase | null }> {
  const candidates = await listEnrichmentCandidates(seed.id);
  const snapshot = generateBusinessIntelligenceSnapshot(seed, candidates);
  const now = new Date().toISOString();
  const existing = await getSeedSuitcase(seed.id);

  const suitcase: SeedSuitcase = {
    seedId: seed.id,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    discoveryEvidence: {
      sourceType: seed.normalized.sourceType,
      sourceReference: seed.normalized.sourceReference,
      ingestedAt: seed.normalized.ingestedAt,
      matchEvidenceCount: seed.matchEvidence.length,
    },
    enrichmentCandidateIds: candidates.map((c) => c.id),
    biSnapshot: snapshot,
    opportunityAnalysis: buildOpportunityAnalysis(snapshot),
    activationNarrative: buildActivationNarrative(seed.id, snapshot, seed.normalized.businessName),
    reportViewedAt: existing?.reportViewedAt ?? null,
    reportViewCount: existing?.reportViewCount ?? 0,
    migratedToStoreId: existing?.migratedToStoreId ?? null,
    migratedAt: existing?.migratedAt ?? null,
  };

  await saveSeedSuitcase(suitcase);

  void import('../platformActivity/platformActivityEmitter.js')
    .then(({ emitPlatformActivity }) =>
      emitPlatformActivity({
        type: 'bi_snapshot_generated',
        severity: 'info',
        actorType: 'system',
        actorId: 'business-ingestion',
        entityType: 'business_seed',
        entityId: seed.id,
        title: 'Business Intelligence Snapshot generated',
        message: snapshot.summary,
        route: `/activate-business/${seed.id}`,
        actionLabel: 'View activation report',
        metadata: {
          snapshotId: snapshot.snapshotId,
          visibilityScore: snapshot.visibilityScore,
          opportunityCount: snapshot.opportunities.length,
        },
      }),
    )
    .catch(() => {});

  return { ok: true, snapshot, suitcase };
}

export async function recordActivationReportView(seedId: string): Promise<{ ok: boolean; viewCount: number }> {
  const suitcase = await getSeedSuitcase(seedId);
  if (!suitcase?.biSnapshot) return { ok: false, viewCount: 0 };

  const now = new Date().toISOString();
  const updated: SeedSuitcase = {
    ...suitcase,
    updatedAt: now,
    reportViewedAt: suitcase.reportViewedAt ?? now,
    reportViewCount: (suitcase.reportViewCount ?? 0) + 1,
  };
  await saveSeedSuitcase(updated);

  void import('../platformActivity/platformActivityEmitter.js')
    .then(({ emitPlatformActivity }) =>
      emitPlatformActivity({
        type: 'activation_report_viewed',
        severity: 'info',
        actorType: 'user',
        entityType: 'business_seed',
        entityId: seedId,
        title: 'Activation report viewed',
        message: 'Business owner viewed the activation intelligence report.',
        route: `/activate-business/${seedId}`,
        metadata: { viewCount: updated.reportViewCount },
      }),
    )
    .catch(() => {});

  return { ok: true, viewCount: updated.reportViewCount };
}

export async function migrateSeedSuitcaseToBusinessSpace(params: {
  seedId: string;
  storeId: string;
}): Promise<{ ok: boolean; briefing: BusinessIntelligenceBriefing | null; suitcase: SeedSuitcase | null }> {
  const suitcase = await getSeedSuitcase(params.seedId);
  if (!suitcase?.biSnapshot) {
    return { ok: false, briefing: null, suitcase };
  }

  const now = new Date().toISOString();
  const updated: SeedSuitcase = {
    ...suitcase,
    updatedAt: now,
    migratedToStoreId: params.storeId,
    migratedAt: now,
  };
  await saveSeedSuitcase(updated);

  const briefing = buildBusinessIntelligenceBriefing(updated.biSnapshot, params.seedId);
  return { ok: true, briefing, suitcase: updated };
}

export async function getPublicBusinessSnapshotForSeed(
  seedId: string,
): Promise<PublicBusinessSnapshot | null> {
  const suitcase = await getSeedSuitcase(seedId);
  if (!suitcase?.biSnapshot) return null;
  return toPublicBusinessSnapshot(suitcase.biSnapshot, seedId);
}
