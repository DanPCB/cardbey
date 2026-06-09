// DANH: skill-round5-video
/**
 * Video generation — brief, script, queue (honest stub for video API).
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const VideoGenerationSkill = {
  name: 'video_generation',
  version: '1.0',
  description: 'Analyze video brief, generate script, and queue video generation when API is configured.',
  triggers: [
    'create_video',
    'generate_video',
    'make_video',
    'video_for_store',
    'store_video',
    'video_content',
    'promotional_video',
    'product_video',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  steps: [
    {
      id: 'analyze_video_brief',
      name: 'Analyze video brief',
      tool: 'analyze_video_brief',
      required: true,
      buildInput: (ctx) => ({
        storeId: ctx.storeId,
        userMessage: ctx.toolInput?.userMessage ?? ctx.intent ?? '',
      }),
    },
    {
      id: 'generate_video_script',
      name: 'Generate video script',
      tool: 'generate_video_script',
      required: true,
      buildInput: (ctx, stepResults) => {
        const brief = stepResults.analyze_video_brief?.output ?? {};
        return {
          style: brief.style,
          duration: brief.duration,
          mood: brief.mood,
          storeName: brief.storeName,
          brandTone: ctx.hydratedContext?.brandKit?.tone ?? 'friendly',
        };
      },
    },
    {
      id: 'queue_video_generation',
      name: 'Queue video generation',
      tool: 'queue_video_generation',
      required: true,
      buildInput: (_ctx, stepResults) => {
        const scriptOut = stepResults.generate_video_script?.output ?? {};
        const brief = stepResults.analyze_video_brief?.output ?? {};
        return {
          script: scriptOut.script,
          style: brief.style,
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

if (!skillRegistry.has(VideoGenerationSkill.name)) {
  skillRegistry.register(VideoGenerationSkill);
}
