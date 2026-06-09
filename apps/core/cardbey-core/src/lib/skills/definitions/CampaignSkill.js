/**
 * Guided campaign creation — brief, graphics, slideshow, copy, QA, and package.
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const CampaignSkill = {
  name: 'campaign',
  version: '1.0',
  description:
    'Create a complete campaign package from a business objective: brief, graphics, copy, QA, and artifact.',
  triggers: [
    'create_campaign',
    'run_campaign',
    'campaign',
    'run_promotion',
    'create_promotion',
    'launch_offer',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  composes: ['store_launch'],
  steps: [
    {
      id: 'create_brief',
      name: 'Define campaign brief',
      tool: 'create_campaign_brief',
      required: true,
      buildInput: (ctx) => ({
        storeId: ctx.storeId,
        objective:
          ctx.toolInput?.objective || ctx.toolInput?.offer || 'promote my business',
        targetAudience: ctx.toolInput?.targetAudience || 'local customers',
        offer: ctx.toolInput?.offer || null,
        duration: ctx.toolInput?.duration || '7 days',
        tone:
          ctx.toolInput?.tone || ctx.hydratedContext?.brandKit?.tone || 'friendly',
      }),
    },
    {
      id: 'find_graphics',
      name: 'Find campaign graphics',
      tool: 'search_hero_media',
      required: false,
      buildInput: (ctx, stepResults) => ({
        query:
          stepResults.create_brief?.output?.brief?.objective ||
          ctx.toolInput?.objective ||
          'promotion',
        mediaType: 'photo',
        storeId: ctx.storeId,
        perPage: 6,
      }),
    },
    {
      id: 'generate_slideshow',
      name: 'Assemble slideshow',
      tool: 'generate_slideshow',
      required: false,
      condition: (ctx, stepResults) =>
        (stepResults.find_graphics?.output?.count ?? 0) > 0,
      buildInput: (ctx, stepResults) => ({
        storeId: ctx.storeId,
        assets: stepResults.find_graphics?.output?.results ?? [],
        brief: stepResults.create_brief?.output?.brief,
      }),
    },
    {
      id: 'write_copy',
      name: 'Write campaign copy',
      tool: 'generate_campaign_copy',
      required: true,
      buildInput: (ctx, stepResults) => ({
        storeId: ctx.storeId,
        brief: stepResults.create_brief?.output?.brief,
        tone:
          ctx.toolInput?.tone || ctx.hydratedContext?.brandKit?.tone || 'friendly',
        platforms: ctx.toolInput?.platforms || ['instagram', 'facebook', 'whatsapp'],
      }),
    },
    {
      id: 'qa_check',
      name: 'Quality check',
      tool: 'qa_campaign_package',
      required: false,
      buildInput: (ctx, stepResults) => ({
        brief: stepResults.create_brief?.output?.brief,
        graphics: stepResults.find_graphics?.output?.results ?? [],
        copy: stepResults.write_copy?.output?.copy,
      }),
    },
    {
      id: 'package',
      name: 'Package campaign',
      tool: 'package_campaign_artifact',
      required: true,
      buildInput: (ctx, stepResults) => ({
        storeId: ctx.storeId,
        brief: stepResults.create_brief?.output?.brief,
        graphics: stepResults.find_graphics?.output?.results ?? [],
        copy: stepResults.write_copy?.output?.copy,
        slideshowId:
          stepResults.generate_slideshow?.output?.slideshowId ?? null,
      }),
    },
  ],
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 2000,
    shouldRetry: (error) =>
      error?.code !== 'VALIDATION_ERROR' && error?.code !== 'PERMISSION_DENIED',
  },
};

if (!skillRegistry.has(CampaignSkill.name)) {
  skillRegistry.register(CampaignSkill);
}
