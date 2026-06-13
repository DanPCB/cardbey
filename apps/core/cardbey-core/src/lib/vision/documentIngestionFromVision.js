/**
 * Dispatch DocumentIngestionSkill pipeline from vision flyer_menu routing.
 * Reuses the same step sequence as performerIngestDocumentRoutes — does not alter skill behavior.
 *
 * TODO: consolidate when CapabilityRegistry absorbs ingestion — this mirror and
 * performerIngestDocumentRoutes should collapse into one composition (fishing-analogy refactor).
 */

import fs from 'node:fs';
import { dispatchTool } from '../toolDispatcher.js';
import { resolveVisionUploadAbsolutePath } from './saveVisionUploads.js';

const PIPELINE_STEPS = [
  'extract_document_data',
  'create_products_from_document',
  'create_promotions_from_document',
  'suggest_campaign_plan',
  'generate_execution_summary',
  'generate_living_document',
];

/**
 * @param {string} stepId
 * @param {object} extractInput
 * @param {Record<string, object>} results
 * @param {string} storeId
 * @param {{ userId?: string | null, missionId?: string | null }} context
 */
function resolveStepInput(stepId, extractInput, results, storeId, context = {}) {
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

/**
 * @param {string} imagePath
 * @returns {{ documentBase64: string, mimeType: string } | null}
 */
function readImageAsExtractInput(imagePath) {
  const abs = resolveVisionUploadAbsolutePath(imagePath);
  if (!abs || !fs.existsSync(abs)) return null;
  const mimeType = abs.endsWith('.png')
    ? 'image/png'
    : abs.endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg';
  return {
    documentBase64: fs.readFileSync(abs).toString('base64'),
    mimeType,
  };
}

/**
 * @param {object} params
 * @param {string} params.storeId
 * @param {string|null} [params.userId]
 * @param {string|null} [params.missionId]
 * @param {string[]} params.imagePaths
 */
export async function dispatchDocumentIngestionFromVision({
  storeId,
  userId = null,
  missionId = null,
  imagePaths = [],
}) {
  const firstPath = Array.isArray(imagePaths) ? imagePaths.find(Boolean) : null;
  const imageData = firstPath ? readImageAsExtractInput(firstPath) : null;
  if (!imageData) {
    return {
      action: 'document_ingestion_failed',
      message: 'Could not read uploaded image for document ingestion.',
      results: {},
    };
  }

  const extractInput = {
    storeId,
    missionId,
    documentBase64: imageData.documentBase64,
    mimeType: imageData.mimeType,
  };
  const context = { storeId, userId, missionId };
  const results = {};

  for (const stepId of PIPELINE_STEPS) {
    const input = resolveStepInput(stepId, extractInput, results, storeId, context);
    const result = await dispatchTool(stepId, input, context);
    results[stepId] = result;
    if (stepId === 'extract_document_data' && result.status === 'failed') {
      return {
        action: 'document_ingestion_failed',
        message: result.output?.message ?? result.error?.message ?? 'Extraction failed',
        results,
      };
    }
  }

  return {
    action: 'document_ingestion_complete',
    storeId,
    results,
    summary: results.generate_execution_summary?.output?.summary ?? null,
  };
}
