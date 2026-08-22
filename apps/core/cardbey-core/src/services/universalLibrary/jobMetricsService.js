/**
 * Phase 2F — durable acquisition / pipeline metrics from Core jobs + assets.
 * Dashboard must display these values; never invent counts client-side.
 */

import { ASSET_STATUS, RIGHTS_STATUS } from './universalAssetTypes.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function getJobMetrics(prisma) {
  const jobs = await prisma.contentPopulationJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  let durationSumMs = 0;
  let durationCount = 0;
  /** @type {Record<string, number>} */
  const byStatus = {};
  /** @type {Record<string, number>} */
  const byProvider = {};
  /** @type {Record<string, number>} */
  const byKind = {};
  let retries = 0;
  let jobsToday = 0;

  const history = jobs.map((job) => {
    const started = job.startedAt ? new Date(job.startedAt).getTime() : null;
    const completed = job.completedAt ? new Date(job.completedAt).getTime() : null;
    const durationMs =
      started != null && completed != null && completed >= started ? completed - started : null;
    if (durationMs != null) {
      durationSumMs += durationMs;
      durationCount += 1;
    }
    byStatus[job.status] = (byStatus[job.status] || 0) + 1;
    byKind[job.kind] = (byKind[job.kind] || 0) + 1;
    const provider = job.provider || 'unknown';
    byProvider[provider] = (byProvider[provider] || 0) + 1;
    if (job.attempt > 1) retries += 1;
    if (new Date(job.createdAt).getTime() >= dayAgo) jobsToday += 1;

    const result = job.result && typeof job.result === 'object' ? job.result : {};
    return {
      id: job.id,
      kind: job.kind,
      provider: job.provider,
      status: job.status,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      durationMs,
      rightsSummary: result.rightsSummary ?? null,
      publishSummary: result.publishSummary ?? result.seeded ?? null,
      failureSummary: job.error || result.error || null,
      retryHistory: {
        attempt: job.attempt,
        maxAttempts: job.maxAttempts,
        retried: job.attempt > 1,
      },
    };
  });

  const [
    totalAssets,
    published,
    failed,
    duplicates,
    rightsUnknown,
    rightsCleared,
    rightsRestricted,
    byProviderGroups,
    byTypeGroups,
  ] = await Promise.all([
    prisma.universalAsset.count(),
    prisma.universalAsset.count({ where: { status: ASSET_STATUS.PUBLISHED } }),
    prisma.universalAsset.count({ where: { status: ASSET_STATUS.FAILED } }),
    prisma.universalAsset.count({ where: { status: ASSET_STATUS.DUPLICATE } }),
    prisma.universalAsset.count({ where: { rightsStatus: RIGHTS_STATUS.UNKNOWN } }),
    prisma.universalAsset.count({ where: { rightsStatus: RIGHTS_STATUS.CLEARED } }),
    prisma.universalAsset.count({ where: { rightsStatus: RIGHTS_STATUS.RESTRICTED } }),
    prisma.universalAsset.groupBy({ by: ['provider'], _count: { _all: true } }),
    prisma.universalAsset.groupBy({ by: ['type'], _count: { _all: true } }),
  ]);

  const publishedAssets = await prisma.universalAsset.findMany({
    where: { status: ASSET_STATUS.PUBLISHED },
    select: { categories: true, license: true, creatorId: true, metadata: true },
    take: 2000,
  });

  /** @type {Record<string, number>} */
  const byIndustry = {};
  let premium = 0;
  let openLicense = 0;
  let withCreator = 0;
  for (const a of publishedAssets) {
    const cats = Array.isArray(a.categories) ? a.categories : [];
    const industry =
      (a.metadata && typeof a.metadata === 'object' && a.metadata.industry) ||
      cats[0] ||
      'uncategorized';
    byIndustry[String(industry)] = (byIndustry[String(industry)] || 0) + 1;
    const meta = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
    if (meta.premium) premium += 1;
    const lic = String(a.license || '').toLowerCase();
    if (meta.openLicense || lic.includes('open') || lic.includes('cc0') || lic.includes('cardbey-internal')) {
      openLicense += 1;
    }
    if (a.creatorId) withCreator += 1;
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    jobs: {
      total: jobs.length,
      byStatus,
      byKind,
      byProvider,
      jobsToday,
      retries,
      avgDurationMs: durationCount ? Math.round(durationSumMs / durationCount) : null,
      history,
    },
    assets: {
      total: totalAssets,
      published,
      failed,
      duplicates,
      rights: {
        cleared: rightsCleared,
        unknown: rightsUnknown,
        restricted: rightsRestricted,
      },
      byProvider: Object.fromEntries(byProviderGroups.map((g) => [g.provider, g._count._all])),
      byType: Object.fromEntries(byTypeGroups.map((g) => [g.type, g._count._all])),
      byIndustry,
      premiumRatio: published ? premium / published : 0,
      openLicenseRatio: published ? openLicense / published : 0,
      creatorRatio: published ? withCreator / published : 0,
    },
    pipeline: {
      throughputJobsPerDay: jobsToday,
      publishRate: totalAssets ? published / totalAssets : 0,
      duplicatesPrevented: duplicates,
      failedRights: rightsUnknown + rightsRestricted,
    },
  };
}

export default getJobMetrics;
