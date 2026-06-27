/**
 * ingest_asset_for_intent_detection — classify upload, suggest intents; no mission until user selects.
 */

import { EXECUTION_STATES } from '../../telemetry/executionStates.js';
import { ingestAssetForIntentDetection } from '../../intake/assetIntentIngestService.js';
import { logAssetIntentProbe, ASSET_INTENT_EVENTS } from '../../intake/assetIntentTelemetry.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const storeId = pickString(input?.storeId, context?.storeId);
  const missionId = pickString(input?.missionId, context?.missionId);
  const filename = pickString(input?.filename, input?.name);
  const mimeType = pickString(input?.mimeType);
  const imageDataUrl = pickString(input?.imageDataUrl, input?.imageUrl, input?.uri);
  const fileAssetId = pickString(input?.fileAssetId) || `asset-${Date.now()}`;

  const ingestResult = await ingestAssetForIntentDetection({
    storeId: storeId || undefined,
    fileAssetId,
    mimeType: mimeType || null,
    filename: filename || null,
    imageDataUrl: imageDataUrl || null,
    source: pickString(input?.source, context?.source, 'performer'),
    currentEntry: pickString(input?.currentEntry, 'performer'),
    userPrompt: pickString(input?.userPrompt, input?.prompt) || null,
    rawOcrText: pickString(input?.rawOcrText, input?.ocrHints?.rawText) || null,
    ocrHints: input?.ocrHints ?? context?.ocrHints ?? null,
    entityContextId: input?.entityContextId ?? null,
  });

  if (!ingestResult.ok) {
    return {
      status: 'failed',
      error: ingestResult.error ?? { message: 'asset_ingest_failed' },
      output: {
        executionState: EXECUTION_STATES.FAILED,
        tool: 'ingest_asset_for_intent_detection',
        phase: 'failed',
      },
    };
  }

  logAssetIntentProbe(ASSET_INTENT_EVENTS.AWAITING_USER, {
    entityContextId: ingestResult.entityContext?.id,
    missionId: missionId || null,
  });

  return {
    status: 'ok',
      output: {
        executionState: EXECUTION_STATES.PLANNED,
        tool: 'ingest_asset_for_intent_detection',
      phase: ingestResult.phase,
      entityContext: ingestResult.entityContext,
      suggestedActions: ingestResult.suggestedActions,
      extracted: ingestResult.extracted ?? null,
      display: ingestResult.display ?? null,
      confidence: ingestResult.confidence,
      evidence: ingestResult.evidence,
      missionId: missionId || null,
      fileAssetId,
      imageDataUrl: imageDataUrl || null,
      message:
        ingestResult.display ??
        ingestResult.entityContext?.contentDisplay ??
        ingestResult.entityContext?.summary ??
        'What would you like to do with this file?',
    },
  };
}
