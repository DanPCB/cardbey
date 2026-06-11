// DANH: skill-round6-document
/**
 * POST /api/performer/ingest-document
 * Multipart or JSON document upload → DocumentIngestionSkill pipeline with SSE progress.
 */

import express from 'express';
import multer from 'multer';
import { requireUserOrGuest } from '../middleware/guestAuth.js';
import { dispatchTool } from '../lib/toolDispatcher.js';
import { enrichDisplayWithLivingDoc } from '../lib/documentIngestion/ingestionDisplayEnrichment.js';
import { createMiJobFromIngestion } from '../services/mi/miJobFromIngestion.js';
import { getPrismaClient } from '../lib/prisma.js';
import { saveUploadToSuitcase } from '../services/suitcase/suitcaseUploadBridge.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

/**
 * @param {import('express').Response} res
 * @param {string} event
 * @param {object} payload
 */
function sseWrite(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * @param {import('express').Response} res
 */
function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
  res.write(':\n\n');
}

const PIPELINE_STEPS = [
  { id: 'extract_document_data', label: 'Extract document data' },
  { id: 'create_products_from_document', label: 'Create products' },
  { id: 'create_promotions_from_document', label: 'Create promotions' },
  { id: 'suggest_campaign_plan', label: 'Build campaign calendar' },
  { id: 'generate_execution_summary', label: 'Generate summary' },
  { id: 'generate_living_document', label: 'Publish living document' },
];

/**
 * @param {Record<string, object>} results
 */
function mergeLivingDocumentIntoSummaryDisplay(results) {
  const summaryOut = results.generate_execution_summary?.output;
  const livingOut = results.generate_living_document?.output;
  if (!summaryOut?.display || !livingOut || typeof livingOut !== 'object') return;
  summaryOut.display = enrichDisplayWithLivingDoc(summaryOut.display, livingOut);
}

/**
 * @param {string} storeId
 * @param {object | null | undefined} extractedData
 * @param {string | null} missionId
 */
function queueMiJobFromIngestion(storeId, extractedData, missionId) {
  if (!storeId || !extractedData || typeof extractedData !== 'object') return;
  const prisma = getPrismaClient();
  void createMiJobFromIngestion(prisma, {
    storeId,
    extractedData,
    missionId,
  }).catch((err) => {
    console.warn('[ingest] MI job creation failed (non-fatal):', err?.message ?? err);
  });
}

/**
 * @param {object} body
 * @param {Express.Multer.File | undefined} file
 */
function buildExtractInput(body, file) {
  const storeId = String(body?.storeId ?? '').trim();
  const missionId =
    typeof body?.missionId === 'string' && body.missionId.trim() ? body.missionId.trim() : null;
  const base = { storeId, missionId };
  if (file?.buffer) {
    const mimeType = file.mimetype || 'image/jpeg';
    return {
      ...base,
      documentBase64: file.buffer.toString('base64'),
      mimeType,
    };
  }
  const documentUrl = String(body?.documentUrl ?? '').trim();
  return {
    ...base,
    documentUrl: documentUrl || undefined,
    documentBase64: body?.documentBase64,
    mimeType: body?.mimeType,
  };
}

router.post('/ingest-document', requireUserOrGuest, upload.single('file'), async (req, res) => {
  const storeId = String(req.body?.storeId ?? '').trim();
  const wantsStream =
    req.headers.accept?.includes('text/event-stream') ||
    req.query?.stream === '1' ||
    req.body?.stream === true ||
    req.body?.stream === 'true';

  if (!storeId) {
    return res.status(400).json({ error: 'storeId is required' });
  }

  const extractInput = buildExtractInput(req.body, req.file);
  const missionId =
    typeof req.body?.missionId === 'string' && req.body.missionId.trim()
      ? req.body.missionId.trim()
      : null;
  const context = { storeId, userId: req.user?.id ?? req.guestId ?? null, missionId };

  if (!wantsStream) {
    const results = {};
    for (const step of PIPELINE_STEPS) {
      const input = await resolveStepInput(step.id, extractInput, results, storeId, context);
      const result = await dispatchTool(step.id, input, context);
      results[step.id] = result;
      if (step.id === 'extract_document_data' && result.status === 'failed') {
        return res.status(422).json({ error: result.output?.message ?? 'Extraction failed', results });
      }
    }
    mergeLivingDocumentIntoSummaryDisplay(results);
    const extData = results.extract_document_data?.output?.data;
    queueMiJobFromIngestion(storeId, extData, missionId);
    const ownerId = req.user?.id ?? null;
    if (ownerId && !String(ownerId).startsWith('guest_')) {
      const documentUrl = extractInput.documentUrl ?? null;
      void saveUploadToSuitcase(
        {
          ownerId,
          storeId,
          missionId,
          fileUrl: documentUrl,
          originalFilename: req.file?.originalname ?? null,
          mimeType: extractInput.mimeType ?? req.file?.mimetype ?? null,
          scanSource: req.body?.scanSource ?? null,
          extractedData: extData ?? null,
        },
        getPrismaClient(),
      ).catch(() => {});
    }
    return res.json({ ok: true, storeId, results });
  }

  sseHeaders(res);
  sseWrite(res, 'pipeline.start', { storeId, steps: PIPELINE_STEPS.map((s) => s.id) });

  /** @type {Record<string, object>} */
  const results = {};

  try {
    for (const step of PIPELINE_STEPS) {
      sseWrite(res, 'step.start', { stepId: step.id, label: step.label });
      const input = await resolveStepInput(step.id, extractInput, results, storeId, context);
      const result = await dispatchTool(step.id, input, context);
      results[step.id] = result;

      if (result.status === 'failed' && step.id === 'extract_document_data') {
        sseWrite(res, 'step.error', {
          stepId: step.id,
          error: result.output?.error ?? 'vision_failed',
          message: result.output?.message ?? result.error?.message,
        });
        sseWrite(res, 'pipeline.error', { stepId: step.id });
        return res.end();
      }

      sseWrite(res, 'step.complete', {
        stepId: step.id,
        status: result.status,
        output: result.output ?? null,
      });
    }

    mergeLivingDocumentIntoSummaryDisplay(results);
    const extData = results.extract_document_data?.output?.data;
    queueMiJobFromIngestion(storeId, extData, missionId);
    const ownerId = req.user?.id ?? null;
    if (ownerId && !String(ownerId).startsWith('guest_')) {
      const documentUrl = extractInput.documentUrl ?? null;
      void saveUploadToSuitcase(
        {
          ownerId,
          storeId,
          missionId,
          fileUrl: documentUrl,
          originalFilename: req.file?.originalname ?? null,
          mimeType: extractInput.mimeType ?? req.file?.mimetype ?? null,
          scanSource: req.body?.scanSource ?? null,
          extractedData: extData ?? null,
        },
        getPrismaClient(),
      ).catch(() => {});
    }

    sseWrite(res, 'pipeline.complete', {
      summary: results.generate_execution_summary?.output?.summary ?? null,
      results,
    });
  } catch (err) {
    sseWrite(res, 'pipeline.error', { message: err?.message ?? String(err) });
  }

  return res.end();
});

/**
 * @param {string} stepId
 * @param {object} extractInput
 * @param {Record<string, object>} results
 * @param {string} storeId
 * @param {{ userId?: string | null }} [context]
 */
async function resolveStepInput(stepId, extractInput, results, storeId, context = {}) {
  const extOut = results.extract_document_data?.output ?? {};
  const productsOut = results.create_products_from_document?.output ?? {};
  const productIds = Array.isArray(productsOut.created)
    ? productsOut.created
    : (productsOut.products ?? []).map((p) => p.productId).filter(Boolean);

  switch (stepId) {
    case 'extract_document_data':
      return extractInput;
    case 'create_products_from_document':
      return {
        storeId,
        extracted: extOut.extracted === true,
        data: extOut.data ?? null,
      };
    case 'create_promotions_from_document':
      return {
        storeId,
        extracted: extOut.extracted === true,
        data: extOut.data ?? null,
        productIds,
        productsExpected: Array.isArray(extOut.data?.products) ? extOut.data.products.length : 0,
      };
    case 'suggest_campaign_plan':
      return {
        storeId,
        missionId: extractInput.missionId ?? null,
        extracted: extOut.extracted === true,
        data: extOut.data ?? null,
        productIds,
        businessName: extOut.data?.businessName ?? extOut.data?.business?.name ?? '',
      };
    case 'generate_execution_summary':
      return {
        extractResult: extOut,
        productsResult: productsOut,
        promosResult: results.create_promotions_from_document?.output ?? {},
        planResult: results.suggest_campaign_plan?.output ?? {},
        storeId,
      };
    case 'generate_living_document':
      return {
        storeId,
        missionId: extractInput.missionId ?? null,
        userId: context?.userId ?? null,
        extractResult: extOut,
        extractedData: extOut.data ?? null,
      };
    default:
      return {};
  }
}

export default router;
