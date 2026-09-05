/**
 * Multi-market discovery — bounded territory/category batches.
 * Preserves Melbourne real-local path; does not search entire countries in one request.
 */

import {
  getCategoryById,
  getTerritoryById,
  validateTerritoryCategoryPair,
} from '../marketRegistry/index.js';
import type { MarketCountryCode } from '../marketRegistry/types.js';
import { ingestDiscoveredCandidates } from '../businessCandidate/candidateIngestionPipeline.js';
import type { BusinessCandidateRecord } from '../businessCandidate/types.js';
import {
  discoveryProviderManager,
} from '../discoveryEngine/providers/DiscoveryProviderManager.js';
import { buildDeterministicBatchId, marketLabel, newJobId } from './batchIds.js';
import { getDiscoveryJobById, upsertDiscoveryJob } from './jobRepository.js';
import type {
  MultiMarketDiscoveryJob,
  PrepareDiscoveryJobInput,
  RunDiscoveryJobInput,
} from './types.js';

function languageForCountry(countryCode: MarketCountryCode, explicit?: 'en' | 'vi'): 'en' | 'vi' {
  if (explicit) return explicit;
  return countryCode === 'VN' ? 'vi' : 'en';
}

export function prepareMultiMarketDiscoveryJob(
  input: PrepareDiscoveryJobInput,
): MultiMarketDiscoveryJob {
  const validation = validateTerritoryCategoryPair({
    countryCode: input.countryCode,
    territoryId: input.territoryId,
    categoryId: input.categoryId,
  });
  if (!validation.ok) {
    throw new Error(`invalid_market_scope:${validation.error}`);
  }

  const territory = getTerritoryById(input.territoryId)!;
  const category = getCategoryById(input.categoryId)!;
  const dryRun = input.dryRun !== false; // default dry-run for safety
  const requestedLimit = Math.min(Math.max(input.requestedLimit ?? 20, 1), 50);
  const searchTerms =
    category.providerSearchTerms[input.countryCode] ??
    category.englishAliases.slice(0, 3);
  const batchId = buildDeterministicBatchId({
    countryCode: input.countryCode,
    territoryId: input.territoryId,
    categoryId: input.categoryId,
    dryRun,
    requestedLimit,
  });

  const now = new Date().toISOString();
  const job: MultiMarketDiscoveryJob = {
    id: newJobId(),
    batchId,
    market: marketLabel(input.countryCode),
    countryCode: input.countryCode,
    regionCode: territory.regionCode ?? null,
    territoryId: territory.id,
    locality: input.locality ?? territory.name,
    categoryId: category.id,
    searchTerms,
    language: languageForCountry(input.countryCode, input.language),
    provider: input.provider ?? 'auto',
    providerCursor: null,
    campaignId: input.campaignId ?? null,
    pilotId: input.pilotId ?? null,
    dryRun,
    slowMode: input.slowMode === true,
    requestedLimit,
    status: 'prepared',
    discoveredCount: 0,
    acceptedCount: 0,
    duplicatesSkipped: 0,
    failureClasses: [],
    estimatedQueryCount: 1, // one territory × one category (bounded)
    createdBy: input.createdBy ?? null,
    createdAt: now,
    startedAt: null,
    completedAt: null,
    queryArea: {
      bbox: territory.bbox ?? null,
      radiusM: territory.defaultRadiusM ?? null,
    },
  };
  return job;
}

export async function prepareAndPersistDiscoveryJob(
  input: PrepareDiscoveryJobInput,
): Promise<MultiMarketDiscoveryJob> {
  const job = prepareMultiMarketDiscoveryJob(input);
  await upsertDiscoveryJob(job);
  return job;
}

function localitySearchName(job: MultiMarketDiscoveryJob): string {
  const territory = getTerritoryById(job.territoryId);
  if (job.locality) return job.locality;
  return territory?.nameEn ?? territory?.name ?? job.territoryId;
}

function categoryLabelForProvider(job: MultiMarketDiscoveryJob): string {
  const category = getCategoryById(job.categoryId);
  return category?.displayName ?? job.categoryId;
}

function searchTermMap(job: MultiMarketDiscoveryJob): Record<string, string> {
  const label = categoryLabelForProvider(job);
  const term = job.searchTerms[0] ?? label;
  return { [label]: term };
}

export async function runMultiMarketDiscovery(
  input: RunDiscoveryJobInput,
): Promise<{ job: MultiMarketDiscoveryJob; accepted?: BusinessCandidateRecord[] }> {
  let job: MultiMarketDiscoveryJob;
  if (input.jobId) {
    const existing = await getDiscoveryJobById(input.jobId);
    if (!existing) throw new Error('job_not_found');
    job = existing;
  } else {
    job = await prepareAndPersistDiscoveryJob(input);
  }

  job = {
    ...job,
    status: 'running',
    startedAt: new Date().toISOString(),
  };
  await upsertDiscoveryJob(job);

  const locality = localitySearchName(job);
  const categoryLabel = categoryLabelForProvider(job);
  const countryCode = job.countryCode;

  try {
    const batch = await discoveryProviderManager.runBatch({
      suburbs: [locality],
      categories: [categoryLabel],
      maxResults: job.requestedLimit,
      dryRun: job.dryRun,
      provider: job.provider,
      slowMode: job.slowMode,
      countryCode,
      regionCode: job.regionCode,
      categorySearchTerms: searchTermMap(job),
    });

    const failureClasses: MultiMarketDiscoveryJob['failureClasses'] = [];
    for (const err of batch.providerErrors) {
      const existing = failureClasses.find((f) => f.code === err.code);
      if (existing) existing.count += 1;
      else failureClasses.push({ code: err.code, count: 1, sampleMessage: err.message });
    }

    let accepted: BusinessCandidateRecord[] | undefined;
    let acceptedCount = 0;
    let duplicatesSkipped = 0;

    if (!job.dryRun && batch.candidates.length > 0) {
      const ingestion = await ingestDiscoveredCandidates(batch.candidates, {
        batchId: job.batchId,
        campaignId: job.campaignId,
        createdBy: job.createdBy,
        createMission: false,
        initialStatus: 'PENDING_QA',
      });
      // Stamp market fields onto accepted candidates
      const { upsertBusinessCandidates } = await import(
        '../businessCandidate/candidateRepository.js'
      );
      const stamped = ingestion.accepted.map((c) => ({
        ...c,
        country: countryCode,
        state: job.regionCode ?? c.state,
        suburb: c.suburb ?? job.locality,
        market: job.market,
        countryCode,
        regionCode: job.regionCode,
        territoryId: job.territoryId,
        locality: job.locality,
        categoryId: job.categoryId,
        sourceLanguage: job.language,
        originalName: c.name,
        claimEligibility: 'pending_qa' as const,
        lastVerifiedAt: null,
        sourceRetrievedAt: c.createdAt,
      }));
      await upsertBusinessCandidates(stamped);
      accepted = stamped;
      acceptedCount = stamped.length;
      duplicatesSkipped = ingestion.duplicatesRejected;
    } else {
      acceptedCount = 0;
      duplicatesSkipped = 0;
    }

    const status: MultiMarketDiscoveryJob['status'] =
      batch.status === 'success'
        ? 'success'
        : batch.status === 'partial'
          ? 'partial'
          : batch.status === 'rate_limited'
            ? 'rate_limited'
            : 'failed';

    job = {
      ...job,
      status,
      discoveredCount: batch.candidates.length,
      acceptedCount,
      duplicatesSkipped,
      failureClasses,
      completedAt: new Date().toISOString(),
      resultPreview: batch.candidates.slice(0, 10).map((c) => ({
        name: c.businessName,
        category: typeof c.metadata.pilotCategory === 'string' ? c.metadata.pilotCategory : c.category,
        locality: c.city,
        address: c.address,
      })),
    };
    await upsertDiscoveryJob(job);
    return { job, accepted };
  } catch (err) {
    job = {
      ...job,
      status: 'failed',
      failureClasses: [
        {
          code: 'technical_error',
          count: 1,
          sampleMessage: err instanceof Error ? err.message : String(err),
        },
      ],
      completedAt: new Date().toISOString(),
    };
    await upsertDiscoveryJob(job);
    throw err;
  }
}

export async function getMultiMarketJobMetrics(countryCode?: MarketCountryCode) {
  const { listDiscoveryJobs, listDiscoveryJobsByCountry } = await import('./jobRepository.js');
  const jobs = countryCode
    ? await listDiscoveryJobsByCountry(countryCode)
    : await listDiscoveryJobs();
  const byTerritory: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const j of jobs) {
    byTerritory[j.territoryId] = (byTerritory[j.territoryId] ?? 0) + j.acceptedCount;
    byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
  }
  return {
    totalJobs: jobs.length,
    byStatus,
    byTerritory,
    discovered: jobs.reduce((s, j) => s + j.discoveredCount, 0),
    accepted: jobs.reduce((s, j) => s + j.acceptedCount, 0),
  };
}

/**
 * QA Review batch cards for multi-market jobs (PilotBatchMetrics-compatible).
 * Dedupes by batchId (latest job wins). Dry-run jobs appear with pendingQa=0.
 */
export async function listMultiMarketQaBatches(limit = 40) {
  const { listDiscoveryJobs } = await import('./jobRepository.js');
  const { buildBatchOnboardingMetrics } = await import(
    '../businessCandidate/buildBatchMetrics.js'
  );
  const jobs = await listDiscoveryJobs();
  const byBatch = new Map<string, (typeof jobs)[number]>();
  for (const job of jobs) {
    const prev = byBatch.get(job.batchId);
    const prevAt = prev?.completedAt || prev?.createdAt || '';
    const nextAt = job.completedAt || job.createdAt || '';
    if (!prev || nextAt >= prevAt) byBatch.set(job.batchId, job);
  }
  const sorted = [...byBatch.values()].sort((a, b) => {
    const aAt = a.completedAt || a.createdAt || '';
    const bAt = b.completedAt || b.createdAt || '';
    return bAt.localeCompare(aAt);
  });

  /** @type {Array<Record<string, unknown>>} */
  const out = [];
  for (const job of sorted.slice(0, Math.max(1, Math.min(limit, 100)))) {
    const metrics = await buildBatchOnboardingMetrics(job.batchId, job.requestedLimit);
    const byStatus = metrics.byStatus || {};
    const pendingQa =
      Number(byStatus.PENDING_QA || 0) + Number(byStatus.DISCOVERED || 0);
    out.push({
      batchId: job.batchId,
      campaignId: job.campaignId || job.batchId,
      countryCode: job.countryCode,
      territoryId: job.territoryId,
      categoryId: job.categoryId,
      locality: job.locality,
      dryRun: job.dryRun === true,
      jobStatus: job.status,
      discovered: Math.max(Number(job.discoveredCount) || 0, Number(metrics.total) || 0),
      pendingQa,
      claimable: Number(byStatus.CLAIMABLE || 0),
      reportViewed: 0,
      verified: Number(byStatus.VERIFIED || 0),
      activated: Number(byStatus.ACTIVE || 0),
      operating: 0,
      biSnapshots: 0,
      seedSuitcases: 0,
    });
  }
  return out;
}
