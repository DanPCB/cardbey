// AUDIT: generate_tags at store/generate_tags.js — store-level LLM tags; this skill uses fetch + per-product SEO tags
// DANH: skill-round4-tags
/**
 * Tag generation — fetch products and suggest SEO tags.
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const TagGenerationSkill = {
  name: 'tag_generation',
  version: '1.0',
  description: 'Generate product and store-level SEO tag suggestions from catalog content.',
  triggers: [
    'generate_tags',
    'add_tags',
    'product_tags',
    'seo_tags',
    'store_tags',
    'tag_products',
    'generate_keywords',
    'add_keywords',
    'improve_seo',
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
      id: 'generate_seo_tags',
      name: 'Generate SEO tags',
      tool: 'generate_seo_tags',
      required: true,
      buildInput: (ctx, stepResults) => ({
        products:
          stepResults.fetch_store_content?.output?.products ??
          stepResults.fetch_store_content?.output?.output?.products ??
          [],
        businessCategory:
          ctx.hydratedContext?.entities?.store?.type ??
          ctx.toolInput?.businessCategory ??
          'retail',
        storeSlug:
          ctx.hydratedContext?.entities?.store?.slug ?? ctx.toolInput?.storeSlug ?? '',
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

if (!skillRegistry.has(TagGenerationSkill.name)) {
  skillRegistry.register(TagGenerationSkill);
}
