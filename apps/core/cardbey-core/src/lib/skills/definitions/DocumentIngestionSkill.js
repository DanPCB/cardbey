// DANH: skill-round6-document
/**
 * Document ingestion — extract business data from flyers/docs, create catalog + promos, plan campaigns.
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @param {object} stepResults @param {string} key */
function stepOutput(stepResults, key) {
  const raw = stepResults[key]?.output;
  if (raw?.output && typeof raw.output === 'object') return raw.output;
  return raw && typeof raw === 'object' ? raw : {};
}

/** @type {import('../types.js').SkillDefinition} */
export const DocumentIngestionSkill = {
  name: 'document_ingestion',
  version: '1.0',
  description:
    'Extracts structured business data from uploaded documents (flyers, brochures, images) via Claude vision, then creates products, promotions, and a campaign calendar.',
  triggers: [
    'scan_document',
    'upload_flyer',
    'import_document',
    'read_flyer',
    'extract_from_document',
    'ingest_document',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  displayResultType: 'document_ingestion_result',
  steps: [
    {
      id: 'extract_document_data',
      name: 'Extract document data',
      tool: 'extract_document_data',
      required: true,
      buildInput: (ctx) => ({
        documentUrl:
          ctx.toolInput?.documentUrl ??
          ctx.toolInput?.imageUrl ??
          null,
        documentBase64:
          ctx.toolInput?.documentBase64 ??
          ctx.toolInput?.imageDataUrl?.replace(/^data:image\/[^;]+;base64,/, '') ??
          null,
        mimeType: ctx.toolInput?.mimeType ?? 'image/jpeg',
        imageUrl:
          ctx.toolInput?.imageUrl ??
          ctx.toolInput?.imageDataUrl ??
          null,
        imageDataUrl: ctx.toolInput?.imageDataUrl ?? null,
        extractedText:
          ctx.toolInput?.extractedText ??
          ctx.toolInput?.campaignContext ??
          ctx.toolInput?.userMessage ??
          '',
        businessName:
          ctx.hydratedContext?.entities?.store?.name ??
          ctx.toolInput?.businessName ??
          '',
      }),
    },
    {
      id: 'create_products_from_document',
      name: 'Create products from document',
      tool: 'create_products_from_document',
      required: false,
      buildInput: (ctx, stepResults) => {
        const ext = stepOutput(stepResults, 'extract_document_data');
        return {
          storeId: ctx.storeId,
          extracted: ext.extracted === true,
          data: ext.data ?? null,
        };
      },
    },
    {
      id: 'create_promotions_from_document',
      name: 'Create promotions from document',
      tool: 'create_promotions_from_document',
      required: false,
      buildInput: (ctx, stepResults) => {
        const ext = stepOutput(stepResults, 'extract_document_data');
        const products = stepOutput(stepResults, 'create_products_from_document');
        const productIds = Array.isArray(products.created)
          ? products.created
          : (products.products ?? []).map((p) => p.productId).filter(Boolean);
        const productsExpected = Array.isArray(ext.data?.products) ? ext.data.products.length : 0;
        return {
          storeId: ctx.storeId,
          extracted: ext.extracted === true,
          data: ext.data ?? null,
          productIds,
          productsExpected,
        };
      },
    },
    {
      id: 'suggest_campaign_plan',
      name: 'Build campaign calendar',
      tool: 'suggest_campaign_plan',
      required: true,
      buildInput: (ctx, stepResults) => {
        const ext = stepOutput(stepResults, 'extract_document_data');
        const productsStep = stepOutput(stepResults, 'create_products_from_document');
        const productIds = Array.isArray(productsStep.created)
          ? productsStep.created
          : (productsStep.products ?? []).map((p) => p.productId).filter(Boolean);
        return {
          storeId: ctx.storeId,
          missionId: ctx.missionId ?? ctx.toolInput?.missionId ?? null,
          productIds,
          extracted: ext.extracted === true,
          data: ext.data ?? null,
          businessName:
            ext.data?.businessName ??
            ext.data?.business?.name ??
            ctx.hydratedContext?.entities?.store?.name ??
            '',
        };
      },
    },
    {
      id: 'generate_execution_summary',
      name: 'Generate execution summary',
      tool: 'generate_execution_summary',
      required: true,
      buildInput: (ctx, stepResults) => ({
        extractResult: stepOutput(stepResults, 'extract_document_data'),
        productsResult: stepOutput(stepResults, 'create_products_from_document'),
        promosResult: stepOutput(stepResults, 'create_promotions_from_document'),
        planResult: stepOutput(stepResults, 'suggest_campaign_plan'),
        storeId: ctx.storeId ?? null,
        storeSlug:
          ctx.hydratedContext?.entities?.store?.slug ??
          ctx.toolInput?.storeSlug ??
          ctx.storeId ??
          null,
      }),
    },
    {
      id: 'generate_living_document',
      name: 'Publish living document storefront',
      tool: 'generate_living_document',
      required: false,
      buildInput: (ctx, stepResults) => {
        const ext = stepOutput(stepResults, 'extract_document_data');
        return {
          storeId: ctx.storeId,
          missionId: ctx.missionId ?? ctx.toolInput?.missionId ?? null,
          userId: ctx.userId ?? null,
          extractResult: ext,
          extractedData: ext.data ?? null,
        };
      },
    },
  ],
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 1500,
    shouldRetry: (error) =>
      error?.code !== 'VALIDATION_ERROR' && error?.code !== 'PERMISSION_DENIED',
  },
};

if (!skillRegistry.has(DocumentIngestionSkill.name)) {
  skillRegistry.register(DocumentIngestionSkill);
}
