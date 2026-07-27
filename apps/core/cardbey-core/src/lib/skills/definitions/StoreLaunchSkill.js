/**
 * Guided store launch — composes brand kit, hero media, social links, and publish.
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const StoreLaunchSkill = {
  name: 'store_launch',
  version: '1.0',
  description:
    'Guide a store owner through complete store setup: brand kit, hero media, social links, and publish.',
  triggers: ['launch_store', 'setup_store', 'complete_store_setup', 'store_launch'],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  steps: [
    {
      id: 'check_brandkit',
      name: 'Set brand identity',
      tool: 'update_brand_kit',
      required: false,
      condition: (ctx) =>
        Boolean(ctx.toolInput?.tone || ctx.toolInput?.colors || ctx.toolInput?.style),
      buildInput: (ctx) => ({
        storeId: ctx.storeId,
        tone: ctx.toolInput?.tone,
        style: ctx.toolInput?.style,
        colors: ctx.toolInput?.colors,
      }),
    },
    {
      id: 'search_hero',
      name: 'Find hero media',
      tool: 'search_hero_media',
      required: false,
      buildInput: (ctx) => ({
        query: ctx.toolInput?.heroQuery || 'store hero',
        mediaType: 'video',
        storeId: ctx.storeId,
      }),
    },
    {
      id: 'set_social_links',
      name: 'Connect social accounts',
      tool: 'setBusinessSocialLinks',
      required: false,
      condition: (ctx) => Boolean(ctx.toolInput?.socialLinks),
      buildInput: (ctx) => ({
        storeId: ctx.storeId,
        socialLinks: ctx.toolInput?.socialLinks,
      }),
    },
    {
      id: 'publish_store',
      name: 'Publish store',
      tool: 'structured_store_build',
      required: true,
      buildInput: (ctx) => ({
        storeId: ctx.storeId,
        missionId: ctx.missionId,
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

if (!skillRegistry.has(StoreLaunchSkill.name)) {
  skillRegistry.register(StoreLaunchSkill);
}
