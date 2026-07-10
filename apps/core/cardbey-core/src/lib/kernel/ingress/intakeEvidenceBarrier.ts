/**
 * Mandatory intake evidence barrier — Reality Stream → Perception → Evidence → AttachmentAnalysis.
 * Performer classification must consume only the frozen Evidence View produced here.
 */

import { randomUUID } from 'node:crypto';
import { ocrExtractText } from '../../ocr/ocrProvider.js';
import { buildAttachmentAnalysis } from '../../intake/attachmentAnalysis.js';
import { selectStreamWindow } from '../ingress.js';
import { recordAttachmentStreamEvents } from '../attachmentRealityStreamSidecar.js';
import { runPassiveCognitivePipeline } from '../passive/passivePipeline.js';
import { buildIntakeEvidenceSnapshot } from './evidenceSnapshot.js';
import { saveIntakeEvidenceBundle } from './evidenceStore.js';
import type {
  IntakeEvidenceBarrierResult,
  IntakeEvidenceBundle,
  IntakeEvidenceTiming,
} from './intakeEvidence.types.js';

export type RunIntakeEvidenceBarrierInput = {
  hasAttachment: boolean;
  imageRef?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  userMessage?: string | null;
  sessionId?: string | null;
  missionId?: string | null;
  fileAssetId?: string | null;
  storeId?: string | null;
  attachmentOnlyUpload?: boolean;
  runVisionEnrichment?: boolean;
  /** Test / replay hook — bypass live OCR. */
  precomputedOcrText?: string | null;
  precomputedOcrFailed?: boolean;
  precomputedOcrProvider?: string | null;
  precomputedOcrError?: string | null;
  skipOcr?: boolean;
};

export function buildAwaitingPerceptionIntakeResponse(
  result: Extract<IntakeEvidenceBarrierResult, { status: 'awaiting_perception' }>,
): Record<string, unknown> {
  return {
    success: true,
    action: 'awaiting_perception',
    runtimeState: 'awaiting_perception',
    executionPath: 'awaiting_perception',
    message: result.message,
    streamId: result.streamId,
    retryAfterMs: 500,
    timing: result.timing ?? null,
  };
}

/**
 * Synchronous intake gate: append Reality Stream, run perception, freeze EvidenceView.
 */
export async function runIntakeEvidenceBarrier(
  input: RunIntakeEvidenceBarrierInput,
): Promise<IntakeEvidenceBarrierResult> {
  if (!input.hasAttachment) {
    return { status: 'no_attachment' };
  }

  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  let ocrMs = 0;
  let realityStreamMs = 0;
  let perceptionMs = 0;
  let evidenceMs = 0;
  let attachmentAnalysisMs = 0;

  const imageRef = String(input.imageRef ?? '').trim() || null;
  let ocrText =
    input.precomputedOcrText != null ? String(input.precomputedOcrText).trim() || null : null;
  let ocrFailed = input.precomputedOcrFailed === true;
  let ocrProvider = input.precomputedOcrProvider ?? null;
  let ocrError = input.precomputedOcrError ?? null;

  if (!input.skipOcr && imageRef && input.precomputedOcrText === undefined) {
    const ocrStart = Date.now();
    try {
      const ocrResult = await ocrExtractText({
        imageDataUrl: imageRef,
        context: { purpose: 'intake_attachment' },
      });
      ocrText = String(ocrResult.text ?? '').trim() || null;
      ocrProvider = ocrResult.provider ?? null;
      ocrFailed = !ocrText;
    } catch (err) {
      ocrFailed = true;
      ocrError = err instanceof Error ? err.message : String(err);
      ocrText = null;
    }
    ocrMs = Date.now() - ocrStart;
  }

  const rsStart = Date.now();
  const correlationId = randomUUID();
  let streamId: string;
  try {
    const streamCtx = recordAttachmentStreamEvents({
      sessionId: input.sessionId ?? null,
      missionId: input.missionId ?? null,
      fileAssetId: input.fileAssetId ?? null,
      filename: input.filename ?? null,
      mimeType: input.mimeType ?? null,
      imageRef,
      userGoal: input.userMessage ?? null,
      ocrText,
      ocrFailed,
      ocrProvider,
      ocrError,
      ingestCorrelationId: correlationId,
      source: 'intake_evidence_barrier',
    });
    streamId = streamCtx.streamId;
  } catch (err) {
    return {
      status: 'awaiting_perception',
      streamId: null,
      message: `Reality stream append failed: ${err instanceof Error ? err.message : String(err)}`,
      timing: { startedAt, totalMs: Date.now() - t0 },
    };
  }
  realityStreamMs = Date.now() - rsStart;

  const pStart = Date.now();
  const passiveRun = runPassiveCognitivePipeline({
    streamId,
    userGoal: input.userMessage ?? null,
    ingestCorrelationId: correlationId,
  });
  perceptionMs = Date.now() - pStart;

  if (!passiveRun?.evidenceView?.evidenceId || !passiveRun?.perceptionFrame) {
    console.info('[KernelIngress] evidence_barrier_timing', {
      streamId,
      startedAt,
      ocrMs,
      realityStreamMs,
      perceptionMs,
      phase: 'awaiting_perception',
      totalMs: Date.now() - t0,
    });
    return {
      status: 'awaiting_perception',
      streamId,
      message: 'Processing your upload — perception is still running.',
      timing: {
        startedAt,
        ocrMs,
        realityStreamMs,
        perceptionMs,
        totalMs: Date.now() - t0,
      },
    };
  }

  const eStart = Date.now();
  const events = selectStreamWindow({ streamId });
  const snapshot = buildIntakeEvidenceSnapshot(events, passiveRun.perceptionFrame);
  evidenceMs = Date.now() - eStart;

  const aaStart = Date.now();
  let attachmentAnalysis: Awaited<ReturnType<typeof buildAttachmentAnalysis>> | null = null;
  try {
    attachmentAnalysis = await buildAttachmentAnalysis({
      filename: input.filename ?? null,
      mimeType: input.mimeType ?? null,
      imageDataUrl: imageRef,
      ocrText: snapshot.ocrText,
      ocrFailed: snapshot.ocrStatus === 'failed',
      ocrProvider: snapshot.ocrProvider,
      userMessage: input.userMessage ?? null,
      storeId: input.storeId ?? null,
      sessionId: input.sessionId ?? null,
      missionId: input.missionId ?? null,
      fileAssetId: input.fileAssetId ?? null,
      attachmentOnlyUpload: input.attachmentOnlyUpload === true,
      runVisionEnrichment: input.runVisionEnrichment === true,
      skipKernelSidecar: true,
      source: 'intake_evidence_barrier',
    });
  } catch (analysisErr) {
    console.warn(
      '[KernelIngress] attachment analysis in barrier failed (non-fatal):',
      analysisErr instanceof Error ? analysisErr.message : analysisErr,
    );
  }
  attachmentAnalysisMs = Date.now() - aaStart;

  const timing: IntakeEvidenceTiming = {
    startedAt,
    completedAt: new Date().toISOString(),
    totalMs: Date.now() - t0,
    realityStreamMs,
    perceptionMs,
    evidenceMs,
    ocrMs,
    attachmentAnalysisMs,
  };

  const bundle: IntakeEvidenceBundle = {
    streamId,
    evidenceView: passiveRun.evidenceView,
    perceptionFrame: passiveRun.perceptionFrame,
    snapshot,
    timing,
  };
  const frozenBundle = saveIntakeEvidenceBundle(bundle);

  const imageContext = {
    extractedText: snapshot.ocrText ?? '',
    provider: snapshot.ocrProvider,
    hasText: Boolean(snapshot.ocrText),
    ocrError: snapshot.ocrError,
    evidenceId: passiveRun.evidenceView.evidenceId,
    streamId,
    attachmentAnalysis,
    ocrWarning: attachmentAnalysis?.ocrWarning ?? null,
    documentType: attachmentAnalysis?.artifactType ?? null,
  };

  console.info('[KernelIngress] evidence_barrier_timing', {
    streamId,
    evidenceId: passiveRun.evidenceView.evidenceId,
    ...timing,
    phase: 'decision_ready',
  });

  return {
    status: 'ready',
    bundle: frozenBundle,
    imageContext,
    attachmentAnalysis,
  };
}

export type { IntakeEvidenceBarrierResult, IntakeEvidenceBundle } from './intakeEvidence.types.js';
