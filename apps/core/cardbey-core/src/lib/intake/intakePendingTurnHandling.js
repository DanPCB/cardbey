/**
 * Pending turn handling for intake v2 — upload ask panel, stale upload clear, confirm prep.
 * Single-path replacement for decision-loop authority gate upload/pending behavior.
 */

import { loadBelief } from '../decision/beliefLoader.js';
import { clearStaleUploadBeliefContext } from '../decision/persistBeliefDelta.js';
import {
  buildUploadAskClarifyFallback,
  shouldRequireUploadAskPanel,
  loadHydratedBeliefForUploadDecision,
  buildUploadAskClarifyFromBelief,
} from '../decision/earlyDecisionLoopGate.js';
import {
  detectExplicitStoreIntent,
  hasExplicitUploadCreateStoreOrWebsiteIntent,
  isAttachmentOnlyPlaceholderMessage,
  isExplicitLoyaltyFromUploadContext,
} from './assetUploadGuard.js';
import { isCasualChatTurn } from './intakeCasualChatTurn.js';
import { isIntakeConfirmAffirmation } from './intakeConfirmIntercept.js';
import { resolveUploadIntakePhase, UPLOAD_INTAKE_PHASE } from './uploadIntakePhase.js';
import { shouldSkipUploadAskForIntakeSelectionReplay } from './intakeReplayPayload.js';

/**
 * Clear stale lastUpload when user sends a new text-only message with explicit store/create intent.
 * @param {object} opts
 */
export async function maybeClearStaleUploadOnTextOnlyIntent(opts = {}) {
  const userMessage = String(opts.userMessage ?? '').trim();
  if (!userMessage || opts.hasAttachment === true) return;
  if (isCasualChatTurn(userMessage) || isIntakeConfirmAffirmation(userMessage)) return;

  const sessionKey = String(opts.sessionKey ?? '').trim();
  if (!sessionKey) return;

  const explicitIntent =
    detectExplicitStoreIntent(userMessage) ||
    hasExplicitUploadCreateStoreOrWebsiteIntent(userMessage);
  if (!explicitIntent) return;

  try {
    await clearStaleUploadBeliefContext(sessionKey);
    console.log('[INTAKE] Cleared stale upload context for text-only explicit intent');
  } catch (err) {
    console.warn('[INTAKE] text-only explicit intent upload clear failed:', err?.message ?? err);
  }
}

/**
 * Upload Ask panel before IntentReasoner (attachment-only / pending upload goal).
 * @param {object} opts
 * @returns {Promise<{ payload: Record<string, unknown>; classification?: Record<string, unknown> } | null>}
 */
export async function maybeRespondUploadAskBeforeClassifier(opts = {}) {
  const userMessage = String(opts.userMessage ?? '').trim();
  if (!userMessage || isCasualChatTurn(userMessage) || isIntakeConfirmAffirmation(userMessage)) {
    return null;
  }

  const replayBody =
    opts.body && typeof opts.body === 'object' && !Array.isArray(opts.body)
      ? opts.body
      : opts.intakeV2Selection
        ? { intakeV2Selection: opts.intakeV2Selection, pendingIntent: opts.pendingIntent ?? null }
        : null;
  if (replayBody && shouldSkipUploadAskForIntakeSelectionReplay(replayBody)) {
    return null;
  }

  if (
    isExplicitLoyaltyFromUploadContext({
      userMessage,
      intentSourceContext: opts.intentSourceContext ?? null,
      attachmentAnalysis: opts.attachmentAnalysis ?? null,
    })
  ) {
    return null;
  }

  const uploadIntakePhase = resolveUploadIntakePhase({
    userMessage,
    attachmentOnlyUpload: opts.attachmentOnlyUpload === true,
    hasImageAttachment: opts.hasAttachment === true,
    intentSourceContext: opts.intentSourceContext ?? null,
  });

  const gateOpts = {
    attachmentOnlyUpload: opts.attachmentOnlyUpload === true,
    uploadIntakePhase,
    hasImageAttachment: opts.hasAttachment === true,
    imageDataUrl: opts.imageDataUrl ?? null,
    intentSourceContext: opts.intentSourceContext ?? null,
    advisorInput: opts.advisorInput ?? null,
    userMessage,
  };

  if (shouldRequireUploadAskPanel(gateOpts)) {
    const belief = await loadHydratedBeliefForUploadDecision({
      beliefLoaderOpts: opts.beliefLoaderOpts,
      imageDataUrl: opts.imageDataUrl ?? null,
      hasImageAttachment: opts.hasAttachment === true,
      attachmentOnlyUpload: opts.attachmentOnlyUpload === true,
    });
    const hasImage =
      Boolean(belief?.lastUpload?.imageRef) ||
      opts.hasAttachment === true ||
      Boolean(String(opts.imageDataUrl ?? '').trim());
    if (hasImage && belief) {
      const payload = buildUploadAskClarifyFromBelief(belief);
      return {
        payload,
        classification: {
          executionPath: 'clarify',
          tool: 'ingest_asset_for_intent_detection',
          confidence: 0.9,
          parameters: {
            imageDataUrl: belief.lastUpload?.imageRef ?? opts.imageDataUrl ?? null,
            source: 'upload_ask_intake',
          },
          message: payload.response,
          clarifyOptions: payload.options ?? [],
          _uploadAskSource: 'intake_pending_turn',
        },
      };
    }
  }

  const fallback = await buildUploadAskClarifyFallback({
    attachmentOnlyUpload: opts.attachmentOnlyUpload === true,
    hasImageAttachment: opts.hasAttachment === true,
    imageDataUrl: opts.imageDataUrl ?? null,
    beliefLoaderOpts: opts.beliefLoaderOpts,
    userMessage,
    advisorInput: opts.advisorInput,
  });

  if (!fallback?.payload) return null;

  const shouldForce =
    !isCasualChatTurn(userMessage) &&
    !isExplicitLoyaltyFromUploadContext({
      userMessage,
      intentSourceContext: opts.intentSourceContext ?? null,
      attachmentAnalysis: opts.attachmentAnalysis ?? null,
    }) &&
    (opts.attachmentOnlyUpload === true ||
      opts.hasAttachment === true ||
      isAttachmentOnlyPlaceholderMessage(userMessage) ||
      uploadIntakePhase === UPLOAD_INTAKE_PHASE.ASK_INTENT);

  if (!shouldForce) return null;

  return {
    payload: fallback.payload,
    classification: fallback.classification,
  };
}

/**
 * Load belief for pending confirm intercept (NL "yes" / plan confirm).
 * @param {object} beliefLoaderOpts
 * @returns {Promise<import('../decision/constants.js').BeliefSnapshot | null>}
 */
export async function loadBeliefForPendingConfirm(beliefLoaderOpts) {
  if (!beliefLoaderOpts) return null;
  try {
    return await loadBelief(beliefLoaderOpts);
  } catch (err) {
    console.warn('[IntakeV2] pending confirm belief load failed:', err?.message ?? err);
    return null;
  }
}
