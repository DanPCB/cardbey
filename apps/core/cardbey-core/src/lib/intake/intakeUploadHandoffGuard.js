/**
 * Strip stale client upload handoff fields so unrelated turns are not hijacked.
 */

import { isIntakeConfirmAffirmation } from './intakeConfirmIntercept.js';
import { isAttachmentOnlyPlaceholderMessage } from './assetUploadGuard.js';
import { isUploadOnlyAskTurn } from './uploadIntakePhase.js';
import { isCasualChatTurn } from './intakeCasualChatTurn.js';

export { isCasualChatTurn };

/**
 * @param {string} userMessage
 * @param {object} uploadCtx
 */
export function shouldInjectStalePendingUploadImage(userMessage, uploadCtx = {}) {
  const msg = String(userMessage ?? '').trim();
  if (!msg) return false;
  if (isIntakeConfirmAffirmation(msg)) return false;
  if (isCasualChatTurn(msg)) return false;
  if (uploadCtx.hasImageAttachment === true) return false;
  if (isAttachmentOnlyPlaceholderMessage(msg)) return true;
  if (isUploadOnlyAskTurn(msg, uploadCtx)) return true;
  return false;
}

/**
 * @param {Record<string, unknown> | null | undefined} intentSourceContext
 * @param {string} userMessage
 * @param {{ hasPendingPlanConfirm?: boolean }} [opts]
 */
export function stripStaleUploadHandoffFromIntentSource(intentSourceContext, userMessage, opts = {}) {
  const base =
    intentSourceContext && typeof intentSourceContext === 'object' && !Array.isArray(intentSourceContext)
      ? { ...intentSourceContext }
      : null;
  if (!base) return null;

  const msg = String(userMessage ?? '').trim();
  const shouldStrip =
    opts.hasPendingPlanConfirm === true ||
    isIntakeConfirmAffirmation(msg) ||
    isCasualChatTurn(msg) ||
    (!base.uploadedAssetPending && !isUploadOnlyAskTurn(msg, { intentSourceContext: base }));

  if (!shouldStrip) return base;

  delete base.uploadedAssetPending;
  delete base.pendingImageDataUrl;
  delete base.imageDataUrl;
  if (base.workflowContext && typeof base.workflowContext === 'object') {
    const wf = { .../** @type {Record<string, unknown>} */ (base.workflowContext) };
    delete wf.uploadedAsset;
    delete wf.pendingIntents;
    base.workflowContext = Object.keys(wf).length ? wf : undefined;
  }
  if (base.uploadContextCleared !== true) {
    base.uploadContextCleared = true;
  }
  return Object.keys(base).length ? base : null;
}
