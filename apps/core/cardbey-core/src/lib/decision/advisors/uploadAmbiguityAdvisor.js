/**
 * Upload ambiguity advisor — attachment-only / unclear upload goal.
 */

import {
  detectCreateStoreFromUploadedAssetIntent,
  detectExplicitStoreIntent,
  hasExplicitUploadCreateStoreOrWebsiteIntent,
  isUploadWithoutClearUserIntent,
  shouldRouteToAssetIntentDetection,
} from '../../intake/assetUploadGuard.js';
import { createHypothesis, pushHypothesis } from '../hypothesisUtils.js';

/**
 * @param {import('../constants.js').BeliefSnapshot} belief
 * @param {import('../advisorTypes.js').AdvisorInput} input
 * @returns {import('../hypothesisUtils.js').Hypothesis[]}
 */
export function uploadAmbiguityAdvisor(belief, input) {
  const hypotheses = [];
  const userMessage = String(input.originalUserMessage ?? input.userMessage ?? '').trim();
  const ctx = {
    attachments: input.attachments,
    imageDataUrl: input.imageDataUrl,
    intentSourceContext: input.intentSourceContext,
    sessionId: belief.sessionKey,
    hasSessionPendingExtraction: Boolean(belief.lastUpload),
  };

  const hasUpload = Boolean(belief.lastUpload?.imageRef || belief.lastUpload?.ocrText || input.hasAttachment);

  if (hasExplicitUploadCreateStoreOrWebsiteIntent(userMessage)) {
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: 'create_store_from_upload',
        score: 0.92,
        advisorId: 'upload_ambiguity',
        suggestedTool: 'create_store',
        evidence: [{ source: 'rules', fact: 'explicit_create_from_upload_phrase' }],
      }),
    );
    return hypotheses;
  }

  if (shouldRouteToAssetIntentDetection(userMessage, ctx) || isUploadWithoutClearUserIntent(userMessage, ctx)) {
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: 'analyze_asset',
        score: 0.88,
        advisorId: 'upload_ambiguity',
        suggestedTool: 'ingest_asset_for_intent_detection',
        evidence: [{ source: 'rules', fact: 'upload_without_clear_intent' }],
      }),
    );
  }

  if (hasUpload && detectExplicitStoreIntent(userMessage)) {
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: 'create_store_from_upload',
        score: 0.85,
        advisorId: 'upload_ambiguity',
        suggestedTool: 'create_store',
        evidence: [{ source: 'rules', fact: 'explicit_store_with_upload_evidence' }],
      }),
    );
  }

  if (detectCreateStoreFromUploadedAssetIntent(userMessage)) {
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: 'create_store_from_upload',
        score: 0.95,
        advisorId: 'upload_ambiguity',
        suggestedTool: 'create_store',
        evidence: [{ source: 'rules', fact: 'create_store_from_uploaded_asset_pattern' }],
      }),
    );
  }

  return hypotheses;
}
