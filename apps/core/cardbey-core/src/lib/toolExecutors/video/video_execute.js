/**
 * video_execute — runs expensive generation only after an approved plan is present.
 */

import { execute as queueVideoGeneration } from './queue_video_generation.js';
import { validatePlanArtifact } from '../../skills/planApprovalSchema.js';

/**
 * @param {object} input
 */
export async function execute(input = {}) {
  const approvedPlan = input?.approvedPlan ?? input?.plan ?? null;
  const validation = validatePlanArtifact(approvedPlan);
  if (!validation.ok) {
    return {
      status: 'failed',
      error: {
        code: 'PLAN_NOT_APPROVED',
        message: 'Video generation requires an approved plan.',
        details: validation.errors ?? [],
      },
    };
  }

  const plan = validation.plan ?? {};
  return queueVideoGeneration({
    script: plan.script,
    style: plan.style,
    storeId: plan.storeId ?? input?.storeId ?? '',
    storeName: plan.storeName ?? input?.storeName ?? '',
    userMessage: input?.userMessage ?? plan.autoPrompt ?? '',
    autoPrompt: plan.autoPrompt ?? '',
    duration: Math.min(10, Math.max(5, Number(plan.duration) || 5)),
    approvedPlan: plan,
  });
}

export default execute;
