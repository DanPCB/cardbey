/**
 * Local growth — audit presence, plan actions, delegate execution, monitor baseline.
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const LocalGrowthSkill = {
  name: 'local_growth',
  version: '1.0',
  description:
    'Audit local market presence, generate a prioritized growth action plan, execute the top action, and set a monitoring baseline.',
  triggers: [
    'grow_locally',
    'local_growth',
    'grow_my_business',
    'improve_visibility',
    'get_more_customers',
    'grow',
    'business_growth',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  composes: ['campaign', 'offer_optimization', 'store_launch', 'smart_display_publish'],
  steps: [
    {
      id: 'audit',
      name: 'Audit local presence',
      tool: 'audit_local_presence',
      required: true,
      buildInput: (ctx) => ({
        storeId: ctx.storeId,
        includeCompetitors: ctx.toolInput?.includeCompetitors ?? false,
      }),
    },
    {
      id: 'plan',
      name: 'Generate growth plan',
      tool: 'generate_growth_plan',
      required: true,
      buildInput: (ctx, stepResults) => ({
        storeId: ctx.storeId,
        audit: stepResults.audit?.output?.audit,
        businessType: ctx.toolInput?.businessType || ctx.hydratedContext?.industry || null,
        goals: ctx.toolInput?.goals || ['more_customers'],
      }),
    },
    {
      id: 'execute',
      name: 'Execute top growth action',
      tool: null,
      required: false,
      condition: (ctx, stepResults) => {
        const topAction = stepResults.plan?.output?.plan?.topAction;
        return topAction?.autoExecute === true;
      },
      buildInput: (ctx, stepResults) => ({
        skillToRun: stepResults.plan?.output?.plan?.topAction?.skillToRun,
        storeId: ctx.storeId,
      }),
    },
    {
      id: 'monitor',
      name: 'Set growth baseline',
      tool: 'monitor_growth_baseline',
      required: false,
      buildInput: (ctx, stepResults) => ({
        storeId: ctx.storeId,
        audit: stepResults.audit?.output?.audit,
        planId: stepResults.plan?.output?.plan?.generatedAt,
        actionTaken: stepResults.execute?.output?.skillToRun || null,
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

if (!skillRegistry.has(LocalGrowthSkill.name)) {
  skillRegistry.register(LocalGrowthSkill);
}
