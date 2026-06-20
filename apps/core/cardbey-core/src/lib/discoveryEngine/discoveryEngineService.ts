/**
 * Discovery Engine orchestration — registry, jobs, promotion, metrics.
 */

import { listSeedRecords } from '../businessIngestion/IngestionRepository.js';
import { buildControlCenterIngestionSnapshot } from '../businessIngestion/buildControlCenterIngestionSnapshot.js';
import { listQaQueue } from '../businessIngestion/QaPromotionService.js';
import {
  buildSeedLifecycleFunnel,
} from '../businessIngestion/seedLifecycleGovernance.js';
import { listSeedLifecycleTransitions } from '../businessIngestion/BusinessSeedStatusTransitionRepository.js';
import {
  listRuns,
  recordDiscoveryIngestionRun,
  summarizeRun,
} from '../businessIngestion/BusinessIngestionRunRepository.js';
import { discoveryPromotionPipeline } from './pipelines/DiscoveryPromotionPipeline.js';
import {
  appendDiscoveryJob,
  createDiscoveryJob,
  listDiscoveryJobs,
  updateDiscoveryJob,
} from './jobs/DiscoveryJobRepository.js';
import { assertDiscoverySeedsGoverned } from './governance/runtimeAuthority.js';
import { assertReferralAllowed } from './providers/referralGuard.js';
import { discoveryRegistry } from './registry/DiscoveryRegistry.js';
import { csvDiscoveryProvider } from './providers/CsvDiscoveryProvider.js';
import { manualDiscoveryProvider } from './providers/ManualDiscoveryProvider.js';
import { osmDiscoveryProvider } from './providers/OsmDiscoveryProvider.js';
import { referralDiscoveryProvider } from './providers/ReferralDiscoveryProvider.js';
import type {
  DiscoveryCenterMetrics,
  DiscoveryDiscoverParams,
  DiscoveryEngineRunResult,
  DiscoveryProviderId,
} from './types/index.js';

let providersRegistered = false;

export function registerDefaultDiscoveryProviders(): void {
  if (providersRegistered) return;
  discoveryRegistry.registerProvider(osmDiscoveryProvider);
  discoveryRegistry.registerProvider(csvDiscoveryProvider);
  discoveryRegistry.registerProvider(referralDiscoveryProvider);
  discoveryRegistry.registerProvider(manualDiscoveryProvider);
  providersRegistered = true;
}

export async function runDiscoveryEngine(
  params: DiscoveryDiscoverParams,
): Promise<DiscoveryEngineRunResult> {
  registerDefaultDiscoveryProviders();

  const job = createDiscoveryJob({
    provider: params.provider,
    region: params.city ?? params.region ?? params.postcode ?? null,
    category: params.category ?? null,
    params: { ...params },
  });

  await appendDiscoveryJob(job);
  await updateDiscoveryJob(job.id, { status: 'running' });
  const startedAt = job.startedAt;

  try {
    if (params.provider === 'referral') {
      await assertReferralAllowed(params);
    }

    const rawCandidates = await discoveryRegistry.discover(params);
    const promotion = await discoveryPromotionPipeline.promote(rawCandidates, {
      batchId: `discovery-job-${job.id}`,
    });

    assertDiscoverySeedsGoverned(promotion.seeds);

    const completedAt = new Date().toISOString();
    const seedsCreated = promotion.seedsCreated;
    const seedsUpdated = promotion.seedsUpdated;

    if (seedsCreated + seedsUpdated === 0) {
      await recordDiscoveryIngestionRun({
        discoveryJobId: job.id,
        provider: params.provider,
        startedAt,
        completedAt,
        candidatesFound: rawCandidates.length,
        seedsCreated,
        seedsUpdated,
        duplicatesRejected: promotion.rejectedDuplicates.length,
        status: rawCandidates.length === 0 ? 'empty' : 'completed',
      });
    }

    const updatedJob = await updateDiscoveryJob(job.id, {
      status: 'completed',
      recordsFound: rawCandidates.length,
      recordsAccepted: seedsCreated + seedsUpdated,
      recordsRejected:
        promotion.rejectedDuplicates.length +
        (rawCandidates.length - promotion.accepted.length - promotion.rejectedDuplicates.length),
      completedAt,
    });

    return {
      job: updatedJob ?? { ...job, status: 'completed', completedAt },
      candidatesFound: rawCandidates.length,
      seedsCreated,
      seedsUpdated,
      duplicatesRejected: promotion.rejectedDuplicates.length,
      reviewRequired: promotion.reviewRequired.length,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const completedAt = new Date().toISOString();
    await updateDiscoveryJob(job.id, {
      status: 'failed',
      error: message,
      completedAt,
    });
    await recordDiscoveryIngestionRun({
      discoveryJobId: job.id,
      provider: params.provider,
      startedAt,
      completedAt,
      candidatesFound: 0,
      seedsCreated: 0,
      seedsUpdated: 0,
      duplicatesRejected: 0,
      status: 'failed',
      error: message,
    });
    throw err;
  }
}

export async function buildDiscoveryCenterMetrics(): Promise<DiscoveryCenterMetrics> {
  const seeds = await listSeedRecords();
  const qaPending = await listQaQueue({ status: 'seeded_pending_qa' });
  const recentJobs = await listDiscoveryJobs(20);
  const recentRuns = await listIngestionRuns(10);
  const recentIngestionRuns = (await listRuns(10)).map(summarizeRun);

  const byStatus: Record<string, number> = {};
  const regionBreakdown: Record<string, number> = {};
  const categoryBreakdown: Record<string, number> = {};
  const sourceBreakdown: Record<string, number> = {};

  for (const seed of seeds) {
    byStatus[seed.verificationStatus] = (byStatus[seed.verificationStatus] ?? 0) + 1;
    const region = seed.normalized.city ?? seed.normalized.operatingRegion ?? 'unknown';
    regionBreakdown[region] = (regionBreakdown[region] ?? 0) + 1;
    const cat = seed.normalized.category ?? 'unknown';
    categoryBreakdown[cat] = (categoryBreakdown[cat] ?? 0) + 1;
    const src = seed.normalized.sourceType ?? 'unknown';
    sourceBreakdown[src] = (sourceBreakdown[src] ?? 0) + 1;
  }

  const snapshot = buildControlCenterIngestionSnapshot({
    totalSeeds: seeds.length,
    byVerificationStatus: byStatus,
    bySourceType: sourceBreakdown,
    recentRuns,
    qaPendingCount: qaPending.length,
    claimQueue: {},
    enrichment: null,
  });

  const candidatesFound = recentJobs.reduce((sum, j) => sum + j.recordsFound, 0);
  const seedLifecycleFunnel = buildSeedLifecycleFunnel(byStatus);
  const recentLifecycleTransitions = (await listSeedLifecycleTransitions({ limit: 15 })).map(
    (t) => ({
      id: t.id,
      seedId: t.seedId,
      fromStatus: t.fromStatus,
      toStatus: t.toStatus,
      lifecycleStage: t.lifecycleStage,
      action: t.action,
      actorId: t.actorId,
      actorType: t.actorType,
      createdAt: t.createdAt,
    }),
  );

  return {
    candidatesFound,
    seedsPendingQa: snapshot.pendingQa,
    claimable: snapshot.claimable,
    verified: snapshot.verified,
    activated: snapshot.activated,
    funnel: {
      discovered: snapshot.discovered,
      pendingQa: snapshot.pendingQa,
      claimable: snapshot.claimable,
      verified: snapshot.verified,
      activated: snapshot.activated,
      operating: snapshot.operating,
    },
    sourceBreakdown,
    regionBreakdown,
    categoryBreakdown,
    recentJobs,
    recentIngestionRuns,
    seedLifecycleFunnel,
    recentLifecycleTransitions,
  };
}

export { discoveryRegistry };
export type { DiscoveryDiscoverParams, DiscoveryProviderId };
