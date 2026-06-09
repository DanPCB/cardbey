/**
 * Analytics report — aggregate store metrics and summarise performance.
 * DANH: skill-round3-analytics
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const AnalyticsReportSkill = {
  name: 'analytics_report',
  version: '1.0',
  description:
    'Aggregate store bookings, catalog, promos, and views; produce a concise performance summary.',
  triggers: [
    'analytics',
    'report',
    'performance',
    'how is my store',
    'store stats',
    'insights',
    'sales report',
    'view report',
    'how many bookings',
    'traffic',
    'conversion',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  steps: [
    {
      id: 'get_analytics',
      name: 'Get store analytics',
      tool: 'get_store_analytics',
      required: true,
      buildInput: (ctx) => ({ storeId: ctx.storeId }),
    },
    {
      id: 'summarise_report',
      name: 'Generate report summary',
      tool: 'generate_report_summary',
      required: true,
      buildInput: (ctx, stepResults) => ({
        analytics: stepResults.get_analytics?.output?.analytics ?? null,
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

if (!skillRegistry.has(AnalyticsReportSkill.name)) {
  skillRegistry.register(AnalyticsReportSkill);
}
