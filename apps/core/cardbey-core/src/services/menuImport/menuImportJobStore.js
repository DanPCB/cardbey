/**
 * In-process + draft-preview durable store for MenuImportJob records.
 * Asset bytes live in S3; job JSON is mirrored onto DraftStore.preview.menuImportJobs.
 */

import { randomUUID } from 'crypto';
import {
  getDraftByGenerationRunId,
  getDraft,
  patchDraftPreview,
} from '../draftStore/draftStoreService.js';

/** @type {Map<string, object>} */
const memoryJobs = new Map();

/**
 * @param {unknown} preview
 */
function parsePreview(preview) {
  if (preview && typeof preview === 'object') return { ...preview };
  if (typeof preview === 'string') {
    try {
      return JSON.parse(preview) || {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * @param {object} job
 */
function publicJobView(job) {
  if (!job || typeof job !== 'object') return null;
  return {
    id: job.id,
    contractVersion: job.contractVersion,
    userId: job.userId,
    spaceId: job.spaceId ?? null,
    missionId: job.missionId ?? null,
    draftStoreId: job.draftStoreId ?? null,
    generationRunId: job.generationRunId ?? null,
    storeId: job.storeId ?? null,
    status: job.status,
    mode: job.mode || 'replace',
    sourceAssets: Array.isArray(job.sourceAssets) ? job.sourceAssets : [],
    extractedResult: job.extractedResult ?? null,
    normalizedResult: job.normalizedResult ?? null,
    menuDocument: job.normalizedResult?.menuDocument ?? job.extractedResult?.menuDocument ?? null,
    warnings: Array.isArray(job.warnings) ? job.warnings : [],
    failureCode: job.failureCode ?? null,
    failureMessage: job.failureMessage ?? null,
    progress: job.progress ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt ?? null,
  };
}

/**
 * @param {string} jobId
 */
export function getMenuImportJobFromMemory(jobId) {
  return memoryJobs.get(String(jobId || '')) || null;
}

/**
 * @param {object} job
 */
export function putMenuImportJobMemory(job) {
  if (!job?.id) return;
  memoryJobs.set(job.id, job);
}

/**
 * @param {object} args
 */
export async function createMenuImportJobRecord(args) {
  const now = new Date().toISOString();
  const job = {
    id: randomUUID(),
    contractVersion: args.contractVersion,
    userId: args.userId,
    spaceId: args.spaceId ?? null,
    missionId: args.missionId ?? null,
    draftStoreId: args.draftStoreId ?? null,
    generationRunId: args.generationRunId,
    storeId: args.storeId ?? 'temp',
    status: 'created',
    mode: args.mode === 'merge' ? 'merge' : 'replace',
    sourceAssets: [],
    extractedResult: null,
    normalizedResult: null,
    warnings: [],
    failureCode: null,
    failureMessage: null,
    progress: { phase: 'created', current: 0, total: 0, message: 'Import created' },
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  putMenuImportJobMemory(job);
  await persistMenuImportJob(job);
  return job;
}

/**
 * @param {object} job
 */
export async function persistMenuImportJob(job) {
  if (!job?.id || !job.generationRunId) return job;
  putMenuImportJobMemory(job);
  job.updatedAt = new Date().toISOString();
  try {
    const draft =
      (job.draftStoreId && (await getDraft(job.draftStoreId))) ||
      (await getDraftByGenerationRunId(job.generationRunId));
    if (!draft?.id) return job;
    job.draftStoreId = draft.id;
    const preview = parsePreview(draft.preview);
    const bucket =
      preview.menuImportJobs && typeof preview.menuImportJobs === 'object'
        ? { ...preview.menuImportJobs }
        : {};
    bucket[job.id] = publicJobView(job);
    // Keep last 5 jobs to avoid unbounded preview growth.
    const ids = Object.keys(bucket).sort((a, b) => {
      const ta = Date.parse(bucket[a]?.updatedAt || 0) || 0;
      const tb = Date.parse(bucket[b]?.updatedAt || 0) || 0;
      return tb - ta;
    });
    for (const drop of ids.slice(5)) delete bucket[drop];
    await patchDraftPreview(
      draft.id,
      { menuImportJobs: bucket, activeMenuImportJobId: job.id },
      { writer: 'menuImportJobStore' },
    );
  } catch (err) {
    console.warn('[menu-import] persist job failed (memory retained):', err?.message || err);
  }
  return job;
}

/**
 * @param {string} jobId
 * @param {string} userId
 * @param {string} [generationRunId]
 */
export async function loadMenuImportJob(jobId, userId, generationRunId) {
  const id = String(jobId || '').trim();
  if (!id) return null;
  let job = getMenuImportJobFromMemory(id);
  if (!job && generationRunId) {
    const draft = await getDraftByGenerationRunId(generationRunId);
    const preview = parsePreview(draft?.preview);
    const stored = preview?.menuImportJobs?.[id];
    if (stored && typeof stored === 'object') {
      job = { ...stored };
      putMenuImportJobMemory(job);
    }
  }
  if (!job) {
    // Scan memory only; without generationRunId we cannot load from draft cheaply.
    return null;
  }
  if (job.userId && userId && job.userId !== userId) {
    const err = new Error('You do not have access to this menu import.');
    err.statusCode = 403;
    err.code = 'MENU_IMPORT_FORBIDDEN';
    throw err;
  }
  return job;
}

export { publicJobView };
