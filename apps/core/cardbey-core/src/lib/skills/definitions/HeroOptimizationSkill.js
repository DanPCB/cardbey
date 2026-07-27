// AUDIT: improve_hero at store/improve_hero.js — blocker stub; this skill audits + suggests media queries
// DANH: skill-round4-hero
/**
 * Hero optimization — audit current hero and suggest replacement media searches.
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const HeroOptimizationSkill = {
  name: 'hero_optimization',
  version: '1.0',
  description: 'Audit storefront hero media and suggest HeroMediaPicker search queries.',
  triggers: [
    'improve_hero',
    'hero_image',
    'update_hero',
    'better_hero',
    'hero_photo',
    'change_hero',
    'hero_banner',
    'store_banner',
    'improve_banner',
    'store_image',
    'main_image',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  steps: [
    {
      id: 'audit_hero_media',
      name: 'Audit hero media',
      tool: 'audit_hero_media',
      required: true,
      buildInput: (ctx) => ({ storeId: ctx.storeId }),
    },
    {
      id: 'suggest_hero_media',
      name: 'Suggest hero media',
      tool: 'suggest_hero_media',
      required: true,
      buildInput: (ctx, stepResults) => {
        const audit =
          stepResults.audit_hero_media?.output ??
          stepResults.audit_hero_media?.output?.output ??
          {};
        return {
          category: audit.category ?? null,
          brandStyle: audit.brandStyle ?? null,
          storeName: audit.storeName ?? ctx.toolInput?.storeName ?? null,
          needsImprovement: audit.needsImprovement ?? true,
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

if (!skillRegistry.has(HeroOptimizationSkill.name)) {
  skillRegistry.register(HeroOptimizationSkill);
}
