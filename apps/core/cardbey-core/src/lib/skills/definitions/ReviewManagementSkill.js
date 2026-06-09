/**
 * Review management — summarise reviews and draft responses.
 * DANH: skill-round3-reviews
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const ReviewManagementSkill = {
  name: 'review_management',
  version: '1.0',
  description:
    'Fetch review summary and draft a suggested reply for the latest unresponded review.',
  triggers: [
    'review',
    'reviews',
    'rating',
    'respond to review',
    'customer feedback',
    'reply to feedback',
    'review summary',
    'get reviews',
    'what do customers say',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  steps: [
    {
      id: 'review_summary',
      name: 'Get review summary',
      tool: 'get_review_summary',
      required: true,
      buildInput: (ctx) => ({ storeId: ctx.storeId }),
    },
    {
      id: 'draft_response',
      name: 'Draft review response',
      tool: 'draft_review_response',
      required: false,
      buildInput: (ctx, stepResults) => {
        const reviews = stepResults.review_summary?.output?.reviews ?? [];
        const latest = Array.isArray(reviews) && reviews.length > 0 ? reviews[0] : null;
        return {
          review: latest,
          storeName: ctx.hydratedContext?.storeName ?? ctx.toolInput?.storeName ?? null,
          brandTone: ctx.hydratedContext?.brandTone ?? ctx.toolInput?.brandTone ?? null,
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

if (!skillRegistry.has(ReviewManagementSkill.name)) {
  skillRegistry.register(ReviewManagementSkill);
}
