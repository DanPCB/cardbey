/**
 * Phase 2 — passive cognitive pipeline.
 * Reality → Perception → Evidence → Reasoning → Alternatives (persist only).
 *
 * Does not route, decide, or execute. Performer behavior unchanged.
 */

import { randomUUID } from 'node:crypto';
import { selectStreamWindow } from '../ingress.js';
import type { PassiveCognitiveRun, RealityStreamWindow } from '../types.js';
import { buildEvidenceViewFromPerception } from '../evidence/buildEvidenceView.js';
import {
  attachmentPerceptionPlugin,
  perceiveAttachmentStream,
} from '../perception/attachmentPerceptionPlugin.js';
import {
  REASONER_ID,
  REASONER_VERSION,
  reasonAttachmentAlternatives,
} from '../reasoning/attachmentAlternativesReasoner.js';
import { persistPassiveCognitiveRun } from './persist.js';

function safeLogWarn(message: string, err: unknown): void {
  console.warn(message, err instanceof Error ? err.message : err);
}

export type PassivePipelineInput = {
  streamId: string;
  userGoal?: string | null;
  ingestCorrelationId?: string | null;
  window?: Partial<RealityStreamWindow>;
};

/**
 * Run passive cognitive layer over a Reality Stream window.
 * Returns persisted immutable outputs; never throws.
 */
export function runPassiveCognitivePipeline(
  input: PassivePipelineInput,
): PassiveCognitiveRun | null {
  try {
    const streamId = String(input.streamId ?? '').trim();
    if (!streamId) return null;

    const window: RealityStreamWindow = {
      streamId,
      fromEventId: input.window?.fromEventId ?? null,
      toEventId: input.window?.toEventId ?? null,
      fromTime: input.window?.fromTime ?? null,
      toTime: input.window?.toTime ?? null,
    };

    const events = selectStreamWindow(window);
    if (!events.length) return null;

    const perception = perceiveAttachmentStream({ streamId, events, window });
    const evidence = buildEvidenceViewFromPerception(perception, events);
    const reasoning = reasonAttachmentAlternatives({
      evidence,
      perception,
      userGoal: input.userGoal,
    });

    const run: PassiveCognitiveRun = {
      runId: randomUUID(),
      streamId,
      createdAt: new Date().toISOString(),
      ingestCorrelationId: input.ingestCorrelationId ?? null,
      perceptionFrame: Object.freeze(structuredClone(perception)),
      evidenceView: Object.freeze(structuredClone(evidence)),
      reasoningFrame: Object.freeze(structuredClone(reasoning)),
    };

    const persisted = persistPassiveCognitiveRun(run);

    console.info('[KernelCognitive] passive_run', {
      runId: persisted.runId,
      streamId: persisted.streamId,
      perceptionPlugin: attachmentPerceptionPlugin.id,
      reasoner: REASONER_ID,
      reasonerVersion: REASONER_VERSION,
      evidenceId: persisted.evidenceView.evidenceId,
      alternativeCount: persisted.reasoningFrame.alternatives.length,
      topAlternative: persisted.reasoningFrame.alternatives[0]?.label ?? null,
      topScore: persisted.reasoningFrame.alternatives[0]?.score ?? null,
      confidence: persisted.reasoningFrame.confidence,
    });

    return persisted;
  } catch (err) {
    safeLogWarn('[KernelCognitive] passive pipeline failed (non-fatal):', err);
    return null;
  }
}

/**
 * Fire-and-forget observer — called after Reality Stream append (Phase 1 sidecar).
 */
export function observePassiveCognitivePipeline(input: PassivePipelineInput): void {
  try {
    runPassiveCognitivePipeline(input);
  } catch (err) {
    safeLogWarn('[KernelCognitive] observe failed (non-fatal):', err);
  }
}
