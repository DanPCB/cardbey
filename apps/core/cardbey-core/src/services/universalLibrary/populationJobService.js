/**
 * Content population job queue — enqueue, run, retry.
 */

import { JOB_KIND, JOB_STATUS } from './universalAssetTypes.js';
import { runAndPersistPipelineStage } from './populationPipeline.js';
import { createUniversalAsset } from './universalAssetService.js';
import { seedCuratedCatalog } from './seedProvider.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function enqueuePopulationJob(prisma, input = {}) {
  const kind = String(input.kind ?? JOB_KIND.PIPELINE).toUpperCase();
  const job = await prisma.contentPopulationJob.create({
    data: {
      kind,
      provider: input.provider ? String(input.provider) : null,
      status: JOB_STATUS.QUEUED,
      payload: input.payload ?? null,
      maxAttempts: Number.isFinite(Number(input.maxAttempts)) ? Number(input.maxAttempts) : 3,
    },
  });
  return { ok: true, job };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} [filters]
 */
export async function listPopulationJobs(prisma, filters = {}) {
  const take = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
  const skip = Math.max(Number(filters.offset) || 0, 0);
  /** @type {import('@prisma/client').Prisma.ContentPopulationJobWhereInput} */
  const where = {};
  if (filters.status) where.status = String(filters.status).toUpperCase();
  if (filters.kind) where.kind = String(filters.kind).toUpperCase();

  const [items, total] = await Promise.all([
    prisma.contentPopulationJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.contentPopulationJob.count({ where }),
  ]);

  return { ok: true, items, total, limit: take, offset: skip };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} job
 */
async function executeJob(prisma, job) {
  const payload = job.payload && typeof job.payload === 'object' ? job.payload : {};

  if (job.kind === JOB_KIND.DISCOVERY || job.kind === JOB_KIND.PROVIDER_SYNC) {
    const seedResult = await seedCuratedCatalog(prisma, {
      ownerId: payload.ownerId ?? null,
      skipExisting: payload.skipExisting !== false,
    });
    return { ok: true, result: seedResult };
  }

  if (job.kind === JOB_KIND.PIPELINE && payload.assetId && payload.stage) {
    const stageResult = await runAndPersistPipelineStage(
      prisma,
      String(payload.assetId),
      String(payload.stage),
      payload.context ?? {},
    );
    return stageResult;
  }

  if (job.kind === JOB_KIND.PIPELINE && payload.create) {
    const created = await createUniversalAsset(prisma, payload.create);
    return created;
  }

  return { ok: false, error: 'unsupported_job_payload' };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} jobId
 */
export async function runPopulationJob(prisma, jobId) {
  const id = String(jobId ?? '').trim();
  const job = await prisma.contentPopulationJob.findUnique({ where: { id } });
  if (!job) return { ok: false, error: 'not_found', status: 404 };
  if (job.status === JOB_STATUS.COMPLETED) {
    return { ok: true, job, skipped: true };
  }

  const attempt = job.attempt + 1;
  await prisma.contentPopulationJob.update({
    where: { id },
    data: { status: JOB_STATUS.RUNNING, attempt, startedAt: new Date() },
  });

  try {
    const outcome = await executeJob(prisma, job);
    if (!outcome.ok) {
      const failed = attempt >= job.maxAttempts;
      const updated = await prisma.contentPopulationJob.update({
        where: { id },
        data: {
          status: failed ? JOB_STATUS.FAILED : JOB_STATUS.QUEUED,
          error: outcome.error ?? 'job_failed',
          result: outcome,
          completedAt: failed ? new Date() : null,
        },
      });
      return { ok: false, job: updated, error: outcome.error, status: 400 };
    }

    const updated = await prisma.contentPopulationJob.update({
      where: { id },
      data: {
        status: JOB_STATUS.COMPLETED,
        result: outcome,
        error: null,
        completedAt: new Date(),
      },
    });
    return { ok: true, job: updated, result: outcome };
  } catch (err) {
    const failed = attempt >= job.maxAttempts;
    const updated = await prisma.contentPopulationJob.update({
      where: { id },
      data: {
        status: failed ? JOB_STATUS.FAILED : JOB_STATUS.QUEUED,
        error: String(err?.message ?? err),
        completedAt: failed ? new Date() : null,
      },
    });
    return { ok: false, job: updated, error: 'execution_error', status: 500 };
  }
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function runNextPopulationJob(prisma) {
  const job = await prisma.contentPopulationJob.findFirst({
    where: { status: JOB_STATUS.QUEUED },
    orderBy: { createdAt: 'asc' },
  });
  if (!job) return { ok: true, job: null, message: 'queue_empty' };
  return runPopulationJob(prisma, job.id);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} jobId
 */
export async function retryPopulationJob(prisma, jobId) {
  const id = String(jobId ?? '').trim();
  const job = await prisma.contentPopulationJob.findUnique({ where: { id } });
  if (!job) return { ok: false, error: 'not_found', status: 404 };

  if (job.status !== JOB_STATUS.FAILED) {
    return { ok: false, error: 'not_failed', status: 400 };
  }

  await prisma.contentPopulationJob.update({
    where: { id },
    data: {
      status: JOB_STATUS.QUEUED,
      error: null,
      completedAt: null,
    },
  });

  return runPopulationJob(prisma, id);
}
