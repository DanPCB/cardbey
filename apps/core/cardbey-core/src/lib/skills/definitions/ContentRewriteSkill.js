// AUDIT: rewrite_descriptions at store/rewrite_descriptions.js — LLM tool; this skill uses fetch + template rewrite
// DANH: skill-round4-content
/**
 * Content rewrite — fetch catalog copy and generate improved descriptions (no auto-persist).
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const ContentRewriteSkill = {
  name: 'content_rewrite',
  version: '1.0',
  description: 'Fetch store product copy and generate improved descriptions for owner review.',
  triggers: [
    'rewrite_descriptions',
    'rewrite_description',
    'improve_descriptions',
    'rewrite_content',
    'better_descriptions',
    'product_descriptions',
    'rewrite_products',
    'improve_copy',
    'fix_descriptions',
    'update_descriptions',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  steps: [
    {
      id: 'fetch_store_content',
      name: 'Fetch store content',
      tool: 'fetch_store_content',
      required: true,
      buildInput: (ctx) => ({ storeId: ctx.storeId }),
    },
    {
      id: 'rewrite_content_copy',
      name: 'Rewrite content copy',
      tool: 'rewrite_content_copy',
      required: true,
      buildInput: (ctx, stepResults) => ({
        storeId: ctx.storeId,
        products:
          stepResults.fetch_store_content?.output?.products ??
          stepResults.fetch_store_content?.output?.output?.products ??
          [],
        brandTone: ctx.hydratedContext?.brandKit?.tone ?? ctx.toolInput?.brandTone ?? null,
        businessCategory:
          ctx.hydratedContext?.entities?.store?.type ?? ctx.toolInput?.businessCategory ?? null,
      }),
    },
  ],
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 1500,
    shouldRetry: (error) =>
      error?.code !== 'VALIDATION_ERROR' && error?.code !== 'PERMISSION_DENIED',
  },
};

if (!skillRegistry.has(ContentRewriteSkill.name)) {
  skillRegistry.register(ContentRewriteSkill);
}
