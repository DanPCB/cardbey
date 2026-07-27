// DANH: skill-round5-video + plan-first approval + audio post-process
/**
 * Video generation — plan preview, Kling execute, then voiceover + music mux.
 */

import { skillRegistry } from '../SkillRegistry.js';
import { VIDEO_PLAN_SCHEMA } from '../planApprovalConstants.js';

/** @type {import('../types.js').SkillDefinition} */
export const VideoGenerationSkill = {
  name: 'video_generation',
  version: '2.1',
  description:
    'Plan video, pause for approval, generate via Kling, then add voiceover and music.',
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
  displayResultType: 'video_generation',
  planning: {
    planFirst: true,
    planExecutor: 'video_plan',
    planStepId: 'video_plan',
    executeStepId: 'video_execute',
    planSchema: VIDEO_PLAN_SCHEMA,
    expensive: true,
  },
  steps: [
    {
      id: 'video_plan',
      name: 'Plan video',
      tool: 'video_plan',
      required: true,
      buildInput: (ctx) => ({
        storeId: ctx.storeId,
        userMessage: ctx.toolInput?.userMessage ?? ctx.intent ?? '',
        brandTone: ctx.hydratedContext?.brandKit?.tone ?? 'friendly',
      }),
    },
    {
      id: 'video_execute',
      name: 'Generate video',
      tool: 'video_execute',
      required: true,
      buildInput: (ctx, stepResults) => {
        const plan =
          ctx.approvedPlan ??
          stepResults.video_plan?.output?.plan ??
          stepResults.video_plan?.output ??
          {};
        return {
          approvedPlan: plan,
          plan,
          storeId: ctx.storeId ?? plan.storeId ?? null,
          storeName: plan.storeName ?? ctx.hydratedContext?.entities?.store?.name ?? '',
          userMessage: ctx.toolInput?.userMessage ?? plan.autoPrompt ?? ctx.intent ?? '',
        };
      },
    },
    {
      id: 'video_audio',
      name: 'Add voiceover and music',
      tool: 'video_audio',
      required: false,
      buildInput: (ctx, stepResults) => {
        const plan =
          ctx.approvedPlan ??
          stepResults.video_plan?.output?.plan ??
          stepResults.video_plan?.output ??
          {};
        const executeOut = stepResults.video_execute?.output ?? {};
        return {
          approvedPlan: plan,
          plan,
          videoOutput: executeOut,
          videoExecuteOutput: executeOut,
          missionId: ctx.missionId ?? null,
        };
      },
    },
  ],
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 1500,
    shouldRetry: (error) =>
      error?.code !== 'VALIDATION_ERROR' &&
      error?.code !== 'PERMISSION_DENIED' &&
      error?.code !== 'PLAN_NOT_APPROVED',
  },
};

if (!skillRegistry.has(VideoGenerationSkill.name)) {
  skillRegistry.register(VideoGenerationSkill);
}
