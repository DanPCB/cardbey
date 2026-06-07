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
    'Extract structured business data from uploaded documents, create products and promotions, and suggest a campaign plan.',
  triggers: [
    'scan_document',
    'upload_flyer',
    'import_document',
    'read_flyer',
    'extract_from_document',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  steps: [
    {
      id: 'extract_document_data',
      name: 'Extract document data',
      tool: 'extract_document_data',
      required: true,
      buildInput: (ctx) => ({
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
        return {
          storeId: ctx.storeId,
          extracted: ext.extracted === true,
          data: ext.data ?? null,
        };
      },
    },
    {
      id: 'suggest_campaign_plan',
      name: 'Suggest campaign plan',
      tool: 'suggest_campaign_plan',
      required: true,
      buildInput: (ctx, stepResults) => {
        const ext = stepOutput(stepResults, 'extract_document_data');
        return {
          extracted: ext.extracted === true,
          data: ext.data ?? null,
          businessName:
            ext.data?.businessName ??
            ctx.hydratedContext?.entities?.store?.name ??
            '',
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
