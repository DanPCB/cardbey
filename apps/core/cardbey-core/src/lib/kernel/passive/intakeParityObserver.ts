/**
 * Phase 2 — passive intake parity observer.
 * Called after Performer classification stabilizes; never changes routing.
 */

import { recordCognitiveParityComparison } from './parityLog.js';
import {
  findPassiveCognitiveRunForIntake,
  resolveIntakeRealityStreamCandidates,
} from './streamLookup.js';

export type ObserveIntakeClassificationParityInput = {
  intakeAssetSessionKey?: string | null;
  contextSessionId?: string | null;
  missionId?: string | null;
  streamId?: string | null;
  intentReasonerTool?: string | null;
  performerTool?: string | null;
  performerConfidence?: number | null;
  classificationSource?: string | null;
  hasAttachment?: boolean;
  userText?: string | null;
  attachmentSignals?: {
    ocrWeak?: boolean;
    ocrFailed?: boolean;
    visionAmbiguous?: boolean;
    missingStore?: boolean;
  };
};

function safeLogWarn(message: string, err: unknown): void {
  console.warn(message, err instanceof Error ? err.message : err);
}

/**
 * Fire-and-forget parity record after intake classification.
 */
export function observeIntakeClassificationParity(
  input: ObserveIntakeClassificationParityInput = {},
): void {
  try {
    const match = findPassiveCognitiveRunForIntake({
      intakeAssetSessionKey: input.intakeAssetSessionKey,
      contextSessionId: input.contextSessionId,
      missionId: input.missionId,
      streamId: input.streamId,
    });

    const candidates = resolveIntakeRealityStreamCandidates({
      intakeAssetSessionKey: input.intakeAssetSessionKey,
      contextSessionId: input.contextSessionId,
      missionId: input.missionId,
      streamId: input.streamId,
    });

    const streamId = match?.streamId ?? candidates[0] ?? null;
    if (!streamId) return;

    recordCognitiveParityComparison({
      streamId,
      intentReasonerTool: input.intentReasonerTool,
      performerTool: input.performerTool,
      performerConfidence: input.performerConfidence,
      classificationSource: input.classificationSource,
      hasAttachment: input.hasAttachment,
      userText: input.userText,
      attachmentSignals: input.attachmentSignals,
    });
  } catch (err) {
    safeLogWarn('[KernelCognitive] intake parity observe failed (non-fatal):', err);
  }
}
