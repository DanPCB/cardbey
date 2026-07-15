/**
 * Durable multi-asset menu import: upload → async extract → review payload.
 * Catalog mutation happens only via existing draft catalog replace after owner approval.
 */

import { randomUUID } from 'crypto';
import { uploadBufferToS3 } from '../../lib/s3Client.js';
import { isDraftOwnedByUser } from '../../lib/draftOwnership.js';
import {
  getDraftByGenerationRunId,
} from '../draftStore/draftStoreService.js';
import { extractMenuFromFile, MenuExtractionLlmError } from '../menuExtraction/extractMenuFromFile.js';
import { MENU_IMPORT_CONTRACT_VERSION, MENU_IMPORT_FAILURE_CODES } from './menuImportContract.js';
import { MENU_IMPORT_LIMITS, validateMenuImportFiles } from './menuImportLimits.js';
import { mergeMenuImportExtractions, toCatalogMenuItems } from './menuImportMerge.js';
import {
  createMenuImportJobRecord,
  loadMenuImportJob,
  persistMenuImportJob,
  publicJobView,
} from './menuImportJobStore.js';

/**
 * @param {import('express').Request} req
 * @param {import('multer').File[]} files
 */
export async function startMenuImportFromUpload(req, files) {
  const userId = req.userId ?? req.user?.id;
  if (!userId) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    err.code = MENU_IMPORT_FAILURE_CODES.MENU_IMPORT_UNAUTHORIZED;
    throw err;
  }

  const clientContract =
    typeof req.body?.contractVersion === 'string' ? req.body.contractVersion.trim() : '';
  if (clientContract && clientContract !== MENU_IMPORT_CONTRACT_VERSION) {
    const err = new Error('Menu import client is outdated. Refresh the page and try again.');
    err.statusCode = 409;
    err.code = MENU_IMPORT_FAILURE_CODES.MENU_IMPORT_CONTRACT_MISMATCH;
    throw err;
  }

  const generationRunId =
    (typeof req.body?.generationRunId === 'string' && req.body.generationRunId.trim()) ||
    (typeof req.query?.generationRunId === 'string' && req.query.generationRunId.trim()) ||
    '';
  if (!generationRunId) {
    const err = new Error('generationRunId is required');
    err.statusCode = 400;
    err.code = 'generation_run_required';
    throw err;
  }

  const validation = validateMenuImportFiles(files);
  if (!validation.ok) {
    const err = new Error(validation.message);
    err.statusCode = 400;
    err.code = validation.code;
    throw err;
  }

  const allowed = await isDraftOwnedByUser(generationRunId, userId);
  if (!allowed) {
    const err = new Error('You do not have access to this draft.');
    err.statusCode = 403;
    err.code = MENU_IMPORT_FAILURE_CODES.MENU_IMPORT_FORBIDDEN;
    throw err;
  }

  const draft = await getDraftByGenerationRunId(generationRunId);
  if (!draft) {
    const err = new Error('Draft not found');
    err.statusCode = 404;
    err.code = 'draft_not_found';
    throw err;
  }

  const missionId =
    (typeof req.body?.missionId === 'string' && req.body.missionId.trim()) ||
    (typeof req.query?.missionId === 'string' && req.query.missionId.trim()) ||
    null;
  const mode = String(req.body?.mode || '').trim() === 'merge' ? 'merge' : 'replace';
  const language = String(req.body?.language || '').trim().toLowerCase() === 'vi' ? 'vi' : 'en';
  const source =
    (typeof req.body?.source === 'string' && req.body.source.trim()) || 'store_draft_preview';

  const preview =
    typeof draft.preview === 'string'
      ? (() => {
          try {
            return JSON.parse(draft.preview);
          } catch {
            return {};
          }
        })()
      : draft.preview || {};
  const businessName =
    (typeof req.body?.storeName === 'string' && req.body.storeName.trim()) ||
    (typeof preview.storeName === 'string' && preview.storeName) ||
    '';
  const businessType =
    (typeof req.body?.storeType === 'string' && req.body.storeType.trim()) ||
    (typeof preview.storeType === 'string' && preview.storeType) ||
    (preview.meta && typeof preview.meta.storeType === 'string' && preview.meta.storeType) ||
    '';

  const job = await createMenuImportJobRecord({
    contractVersion: MENU_IMPORT_CONTRACT_VERSION,
    userId,
    missionId,
    draftStoreId: draft.id,
    generationRunId,
    storeId: 'temp',
    mode,
  });

  job.status = 'uploading';
  job.progress = {
    phase: 'uploading',
    current: 0,
    total: files.length,
    message: `Uploading 0 of ${files.length}…`,
  };
  await persistMenuImportJob(job);

  const sourceAssets = [];
  let order = 0;
  for (const file of files) {
    order += 1;
    const assetId = randomUUID();
    const mime = file.mimetype || 'application/octet-stream';
    const originalFilename = file.originalname || `menu-${order}`;
    const { key, url } = await uploadBufferToS3(
      file.buffer,
      originalFilename,
      mime,
      'artifacts',
    );
    sourceAssets.push({
      id: assetId,
      importJobId: job.id,
      sourceOrder: order,
      originalFilename,
      mimeType: mime,
      sizeBytes: file.buffer?.length ?? file.size ?? 0,
      storageKey: key,
      publicOrSignedReadUrl: url,
      uploadStatus: 'uploaded',
      // Keep buffer briefly for immediate extraction; drop after extract.
      _buffer: file.buffer,
    });
    job.progress = {
      phase: 'uploading',
      current: order,
      total: files.length,
      message: `Uploading ${order} of ${files.length}…`,
    };
    job.sourceAssets = sourceAssets.map(stripAssetBuffer);
    await persistMenuImportJob(job);
  }

  job.status = 'uploaded';
  job.progress = {
    phase: 'uploaded',
    current: files.length,
    total: files.length,
    message: 'Upload complete. Starting extraction…',
  };
  job.sourceAssets = sourceAssets.map(stripAssetBuffer);
  job._extractContext = { businessName, businessType, language, source };
  job._sourceBuffers = sourceAssets.map((a) => ({
    id: a.id,
    sourceOrder: a.sourceOrder,
    mimeType: a.mimeType,
    buffer: a._buffer,
  }));
  await persistMenuImportJob(job);

  // Kick background extraction — do not await; return 202 to the browser.
  setImmediate(() => {
    void runMenuImportExtraction(job.id).catch((err) => {
      console.error('[menu-import] background extraction failed', job.id, err?.message || err);
    });
  });

  return {
    ok: true,
    accepted: true,
    contractVersion: MENU_IMPORT_CONTRACT_VERSION,
    jobId: job.id,
    status: job.status,
    job: publicJobView(job),
  };
}

function stripAssetBuffer(asset) {
  const { _buffer, ...rest } = asset;
  return rest;
}

/**
 * @param {string} jobId
 */
export async function runMenuImportExtraction(jobId) {
  const mem = (await import('./menuImportJobStore.js')).getMenuImportJobFromMemory(jobId);
  if (!mem) return;
  const job = mem;
  job.status = 'extracting';
  job.progress = {
    phase: 'extracting',
    current: 0,
    total: (job._sourceBuffers || []).length,
    message: 'Reading menu pages…',
  };
  await persistMenuImportJob(job);

  const ctx = job._extractContext || {};
  const buffers = Array.isArray(job._sourceBuffers) ? job._sourceBuffers : [];
  const perAsset = [];

  try {
    for (let i = 0; i < buffers.length; i++) {
      const src = buffers[i];
      job.progress = {
        phase: 'extracting',
        current: i + 1,
        total: buffers.length,
        message: `Reading page ${i + 1} of ${buffers.length}…`,
      };
      await persistMenuImportJob(job);

      const mime = src.mimeType || 'image/jpeg';
      const fileType = mime === 'application/pdf' ? 'pdf' : 'image';
      let result;
      try {
        result = await extractMenuFromFile({
          fileType,
          fileBuffer: src.buffer,
          mimeType: mime,
          businessName: ctx.businessName || '',
          businessType: ctx.businessType || '',
          language: ctx.language === 'vi' ? 'vi' : 'en',
        });
      } catch (e) {
        if (e instanceof MenuExtractionLlmError) {
          job.status = 'failed';
          job.failureCode = MENU_IMPORT_FAILURE_CODES.MENU_IMPORT_EXTRACTION_FAILED;
          job.failureMessage =
            'We could not read this menu. Try clearer photos or a PDF with selectable text.';
          job.completedAt = new Date().toISOString();
          delete job._sourceBuffers;
          await persistMenuImportJob(job);
          return;
        }
        throw e;
      }

      const items = Array.isArray(result.items)
        ? result.items.map((it) => ({
            ...it,
            name: it.name,
            category: it.category,
            confidence: it.confidence,
          }))
        : [];

      perAsset.push({
        assetId: src.id,
        sourceOrder: src.sourceOrder,
        items,
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
        contact: result.contact || undefined,
        openingHours: result.openingHours || undefined,
        notes: result.notes || undefined,
      });
    }

    job.progress = {
      phase: 'merging',
      current: buffers.length,
      total: buffers.length,
      message: 'Combining menu sections…',
    };
    await persistMenuImportJob(job);

    const merged = mergeMenuImportExtractions(perAsset);
    const catalogItems = toCatalogMenuItems(merged.items);
    const lowConfidenceCount = catalogItems.filter((it) => (it.confidence ?? 1) < 0.7).length;

    job.extractedResult = {
      perAssetCount: perAsset.length,
      categories: merged.categories,
      contact: merged.contact,
      openingHours: merged.openingHours,
      notes: merged.notes,
    };
    job.normalizedResult = {
      items: catalogItems,
      itemCount: catalogItems.length,
      categoryCount: (merged.categories || []).length,
      lowConfidenceCount,
      contact: merged.contact,
      openingHours: merged.openingHours,
      warnings: merged.warnings,
      needsReview: catalogItems.length > 0,
    };
    job.warnings = merged.warnings || [];
    job.status = catalogItems.length ? 'needs_review' : 'failed';
    if (!catalogItems.length) {
      job.failureCode = MENU_IMPORT_FAILURE_CODES.MENU_IMPORT_EXTRACTION_FAILED;
      job.failureMessage = 'No menu items detected. Try clearer photos or add another page.';
    }
    job.progress = {
      phase: job.status === 'needs_review' ? 'needs_review' : 'failed',
      current: buffers.length,
      total: buffers.length,
      message:
        job.status === 'needs_review'
          ? `${catalogItems.length} services found · ${lowConfidenceCount} need review`
          : job.failureMessage,
    };
    job.completedAt = job.status === 'needs_review' ? null : new Date().toISOString();
    delete job._sourceBuffers;
    delete job._extractContext;
    await persistMenuImportJob(job);
  } catch (err) {
    console.error('[menu-import] extraction error', jobId, err);
    job.status = 'failed';
    job.failureCode = MENU_IMPORT_FAILURE_CODES.MENU_IMPORT_EXTRACTION_FAILED;
    job.failureMessage = 'Menu extraction failed. Please try again.';
    job.progress = {
      phase: 'failed',
      current: 0,
      total: buffers.length,
      message: job.failureMessage,
    };
    job.completedAt = new Date().toISOString();
    delete job._sourceBuffers;
    await persistMenuImportJob(job);
  }
}

/**
 * @param {string} jobId
 * @param {string} userId
 * @param {string} [generationRunId]
 */
export async function getMenuImportJobStatus(jobId, userId, generationRunId) {
  const job = await loadMenuImportJob(jobId, userId, generationRunId);
  if (!job) {
    const err = new Error('Menu import job not found');
    err.statusCode = 404;
    err.code = MENU_IMPORT_FAILURE_CODES.MENU_IMPORT_JOB_NOT_FOUND;
    throw err;
  }
  return {
    ok: true,
    contractVersion: MENU_IMPORT_CONTRACT_VERSION,
    job: publicJobView(job),
  };
}

export { MENU_IMPORT_LIMITS, MENU_IMPORT_CONTRACT_VERSION };
