// AUDIT: no homepage feature skill found — new (Round 4)
// DANH: skill-round4-feature
/**
 * Homepage feature — identify a product target and apply homepage highlight (stub when schema lacks isFeatured).
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const HomepageFeatureSkill = {
  name: 'homepage_feature',
  version: '1.0',
  description: 'Identify a product to feature on the store homepage and apply a featured flag when supported.',
  triggers: [
    'feature_on_homepage',
    'feature_this',
    'pin_to_homepage',
    'homepage_feature',
    'feature_product',
    'highlight_product',
    'pin_product',
    'feature_on_store',
    'show_on_homepage',
    'homepage_highlight',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  steps: [
    {
      id: 'identify_feature_target',
      name: 'Identify feature target',
      tool: 'identify_feature_target',
      required: true,
      buildInput: (ctx) => ({
        storeId: ctx.storeId,
        userMessage:
          ctx.toolInput?.userMessage ??
          ctx.toolInput?.prompt ??
          ctx.hydratedContext?.lastUserMessage ??
          '',
      }),
    },
    {
      id: 'apply_homepage_feature',
      name: 'Apply homepage feature',
      tool: 'apply_homepage_feature',
      required: true,
      buildInput: (ctx, stepResults) => ({
        storeId: ctx.storeId,
        productId:
          stepResults.identify_feature_target?.output?.targetProduct?.id ??
          stepResults.identify_feature_target?.output?.output?.targetProduct?.id ??
          null,
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

if (!skillRegistry.has(HomepageFeatureSkill.name)) {
  skillRegistry.register(HomepageFeatureSkill);
}
