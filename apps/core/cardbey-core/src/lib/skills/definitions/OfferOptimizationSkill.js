/**
 * Offer optimization — analyze performance, suggest improvements, apply, and track.
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const OfferOptimizationSkill = {
  name: 'offer_optimization',
  version: '1.0',
  description:
    'Analyze current offer performance, generate improvement suggestions, apply the best option, and track the outcome.',
  triggers: [
    'optimize_offer',
    'improve_offer',
    'offer_optimization',
    'boost_campaign',
    'improve_promotion',
    'optimize_promotion',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  composes: ['campaign'],
  steps: [
    {
      id: 'analyze',
      name: 'Analyze offer performance',
      tool: 'analyze_offer_performance',
      required: true,
      buildInput: (ctx) => ({
        storeId: ctx.storeId,
        offerId: ctx.toolInput?.offerId || null,
        campaignId: ctx.toolInput?.campaignId || null,
        lookbackDays: ctx.toolInput?.lookbackDays || 7,
      }),
    },
    {
      id: 'suggest',
      name: 'Generate improvements',
      tool: 'suggest_offer_improvements',
      required: true,
      buildInput: (ctx, stepResults) => ({
        storeId: ctx.storeId,
        analysis: stepResults.analyze?.output?.analysis,
        tone:
          ctx.toolInput?.tone || ctx.hydratedContext?.brandKit?.tone || 'friendly',
        brandKit: ctx.hydratedContext?.brandKit || null,
      }),
    },
    {
      id: 'apply',
      name: 'Apply optimization',
      tool: 'apply_offer_optimization',
      required: false,
      condition: (ctx, stepResults) =>
        (stepResults.suggest?.output?.suggestions?.length ?? 0) > 0,
      buildInput: (ctx, stepResults) => ({
        storeId: ctx.storeId,
        offerId: ctx.toolInput?.offerId || null,
        suggestion: stepResults.suggest?.output?.suggestions?.[0],
        confirmed: ctx.toolInput?.confirmed || false,
      }),
    },
    {
      id: 'track',
      name: 'Track outcome',
      tool: 'track_offer_outcome',
      required: false,
      condition: (ctx, stepResults) => stepResults.apply?.output?.applied === true,
      buildInput: (ctx, stepResults) => ({
        storeId: ctx.storeId,
        offerId: ctx.toolInput?.offerId || null,
        optimizationId: stepResults.apply?.output?.suggestion?.id,
        baselineMetrics: stepResults.analyze?.output?.analysis?.metrics,
        suggestion: stepResults.apply?.output?.suggestion,
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

if (!skillRegistry.has(OfferOptimizationSkill.name)) {
  skillRegistry.register(OfferOptimizationSkill);
}
