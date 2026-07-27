/**
 * Single source of truth for paid AI: only paid_ai is gated by auth and credits/bundle.
 * Template/manual/free_api run fn() with no checks.
 * Idempotency: one running job per (userId, refId, actionName); return 202 if already in progress; consume only on success.
 */

import { CostSource, isChargeable } from './costPolicy.js';
import {
  getBalance,
  estimateCost,
  spendCredits,
  consumeWelcomeBundle,
} from './creditsService.js';
import { startPaidAiJob, completePaidAiJob } from './paidAiJobService.js';

const AI_IMAGE_CAP = 50;

/**
 * @param {{
 *   user?: { id: string, welcomeFullStoreRemaining?: number, aiCreditsBalance?: number } | null
 *   userId?: string | null
 *   costSource: string
 *   actionName: string
 *   estimate?: { images?: number, textUnits?: number }
 *   refId?: string
 *   allowWelcomeBundle?: boolean
 *   skipCreditsForDraftPreview?: boolean
 *   isDraft?: boolean
 *   actionType?: string
 *   source?: string
 *   billingSource?: string
 *   storeType?: string | null
 * }} options
 * @param {() => Promise<T>} fn - The paid AI work (menu gen, image gen, etc.)
 * @returns {Promise<T>}
 * @throws {Error} with .code AUTH_REQUIRED_FOR_AI | INSUFFICIENT_CREDITS | AI_IMAGE_CAP_EXCEEDED | PAID_AI_JOB_IN_PROGRESS (202)
 */
export async function withPaidAiBudget(options, fn) {
  const {
    user = null,
    userId: userIdOpt = null,
    costSource,
    actionName,
    estimate = {},
    refId = null,
    allowWelcomeBundle = true,
  } = options;

  if (costSource !== CostSource.paid_ai || !isChargeable(costSource)) {
    return fn();
  }

  const userId = (user && user.id) || userIdOpt || null;
  if (!userId) {
    const err = new Error('Authentication required to use paid AI');
    err.code = 'AUTH_REQUIRED_FOR_AI';
    err.status = 401;
    throw err;
  }

  const images = Math.max(0, estimate.images ?? 0);
  if (images > AI_IMAGE_CAP) {
    const err = new Error(`AI image count exceeds maximum of ${AI_IMAGE_CAP}`);
    err.code = 'AI_IMAGE_CAP_EXCEEDED';
    err.status = 400;
    throw err;
  }

  /** Draft / preview generation (store + mini-website build_store jobs) must not require credits; billing stays on publish / campaigns / other paid_ai actions. */
  const skipCreditsForDraftPreview =
    options.skipCreditsForDraftPreview === true ||
    options.isDraft === true ||
    options.actionType === 'draft_preview' ||
    options.source === 'performer_draft' ||
    options.billingSource === 'performer_draft' ||
    actionName === 'draft.generate.ai.full';

  if (skipCreditsForDraftPreview) {
    const src =
      options.source ??
      options.billingSource ??
      (actionName === 'draft.generate.ai.full' ? 'draft.generate.ai.full' : 'draft_preview_flag');
    console.log('[DraftGeneration] Credit check bypassed for draft preview', {
      userId,
      storeType: options.storeType ?? null,
      source: src,
      actionName,
      refId: refId ?? null,
    });
    return fn();
  }

  const cost = estimateCost(estimate);
  let balance = user && (user.welcomeFullStoreRemaining != null || user.aiCreditsBalance != null)
    ? {
        welcomeFullStoreRemaining: user.welcomeFullStoreRemaining ?? 0,
        aiCreditsBalance: user.aiCreditsBalance ?? 0,
      }
    : await getBalance(userId);

  const useBundle = allowWelcomeBundle && balance.welcomeFullStoreRemaining > 0;
  if (!useBundle && cost > 0 && balance.aiCreditsBalance < cost) {
    const err = new Error('Insufficient credits for this action');
    err.code = 'INSUFFICIENT_CREDITS';
    err.status = 402;
    throw err;
  }

  const refIdKey = refId && typeof refId === 'string' ? refId : 'unknown';
  const { jobId, inProgress } = await startPaidAiJob({ userId, refId: refIdKey, actionName });
  if (inProgress) {
    const err = new Error('A paid AI job for this draft is already in progress');
    err.code = 'PAID_AI_JOB_IN_PROGRESS';
    err.status = 202;
    err.jobId = jobId;
    throw err;
  }

  let result;
  try {
    result = await fn();
    await completePaidAiJob({ jobId, success: true });
  } catch (e) {
    await completePaidAiJob({ jobId, success: false }).catch(() => {});
    throw e;
  }

  if (useBundle) {
    await consumeWelcomeBundle(userId, actionName, refId);
  } else if (cost > 0) {
    await spendCredits(userId, cost, actionName, refId);
  }

  return result;
}

export { AI_IMAGE_CAP };
