/**
 * Store health — audit profile completeness and prioritise fixes.
 * DANH: skill-round3-health
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const StoreHealthSkill = {
  name: 'store_health',
  version: '1.0',
  description:
    'Audit store profile completeness, score health, and return prioritised fixes.',
  triggers: [
    'store health',
    'audit my store',
    "what's missing",
    'complete my profile',
    'store score',
    'improve my store',
    'checklist',
    'store completeness',
    'setup',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  steps: [
    {
      id: 'audit_completeness',
      name: 'Audit store completeness',
      tool: 'audit_store_completeness',
      required: true,
      buildInput: (ctx) => ({ storeId: ctx.storeId }),
    },
    {
      id: 'health_report',
      name: 'Generate health report',
      tool: 'generate_health_report',
      required: true,
      buildInput: (ctx, stepResults) => ({
        audit: stepResults.audit_completeness?.output ?? null,
        storeId: ctx.storeId,
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

if (!skillRegistry.has(StoreHealthSkill.name)) {
  skillRegistry.register(StoreHealthSkill);
}
