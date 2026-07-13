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
import {
  buildAttachmentCacheKey,
  getCachedAttachmentAnalysis,
  setCachedAttachmentAnalysis,
} from '../../intake/attachmentAnalysisCache.js';
import {
  buildAnalysisBundleRecord,
  registerAttachmentIngestion,
  stampEvidenceOnAttachmentAnalysis,
} from '../../intake/attachmentEvidenceRegistry.js';
import { Features } from '../../../config/features.js';
import { applyIntakeEvidenceToGraph } from '../../evidence/missionEvidenceGraphService.js';
import { runReasoningStep } from '../../reasoning/reasoningCoordinator.js';
import { hasAuthoritativeLoyaltyTopology } from '../../loyalty/loyaltyContractDiagnostics.js';
import { loyaltyTopologyNeedsOcrReconcile } from '../../loyalty/loyaltyTopologyOcrReconcile.js';

function cachedLoyaltyAnalysisNeedsRerun(
  cached: ReturnType<typeof getCachedAttachmentAnalysis>,
): boolean {
  const aa = cached?.attachmentAnalysis;
  if (!aa || typeof aa !== 'object') return false;
  const record = aa as {
    artifactType?: string;
    cardTopology?: unknown;
    ocrText?: string | null;
    preseededDraft?: { programType?: string; cardTopology?: unknown; ocrText?: string | null };
  };
  const isLoyalty =
    String(record.artifactType ?? '').trim() === 'loyalty_card' ||
    record.preseededDraft?.programType === 'stamp_card';
  if (!isLoyalty) return false;
  const topology = record.preseededDraft?.cardTopology ?? record.cardTopology;
  const ocrText = record.ocrText ?? record.preseededDraft?.ocrText ?? cached?.ocrTextRef ?? null;
  if (!hasAuthoritativeLoyaltyTopology(topology)) return true;
  return loyaltyTopologyNeedsOcrReconcile(
    topology as { rows?: number; columns?: number },
    ocrText,
  );
}

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
  abortSignal?: AbortSignal | null;
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

  const abortIfNeeded = () => {
    if (input.abortSignal?.aborted) {
      const err = new Error('request_aborted:intake_evidence_barrier');
      (err as Error & { code?: string }).code = 'REQUEST_ABORTED';
      throw err;
    }
  };

  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  let ocrMs = 0;
  let realityStreamMs = 0;
  let perceptionMs = 0;
  let evidenceMs = 0;
  let attachmentAnalysisMs = 0;

  const imageRef = String(input.imageRef ?? '').trim() || null;
  const ingestion = registerAttachmentIngestion({
    imageRef,
    sessionId: input.sessionId ?? null,
    storeId: input.storeId ?? null,
  });
  const cacheKey = buildAttachmentCacheKey(imageRef);
  const cached = cacheKey ? getCachedAttachmentAnalysis(cacheKey) : null;

  let ocrText =
    cached?.ocrTextRef ??
    (input.precomputedOcrText != null ? String(input.precomputedOcrText).trim() || null : null);
  let ocrFailed = input.precomputedOcrFailed === true;
  let ocrProvider = input.precomputedOcrProvider ?? null;
  let ocrError = input.precomputedOcrError ?? null;

  abortIfNeeded();

  if (!input.skipOcr && imageRef && input.precomputedOcrText === undefined && !cached?.ocrTextRef) {
    const ocrStart = Date.now();
    try {
      const ocrResult = await ocrExtractText({
        imageDataUrl: imageRef,
        context: { purpose: 'intake_attachment' },
      });
      abortIfNeeded();
      ocrText = String(ocrResult.text ?? '').trim() || null;
      ocrProvider = ocrResult.provider ?? null;
      ocrFailed = !ocrText;
    } catch (err) {
      if ((err as Error & { code?: string })?.code === 'REQUEST_ABORTED') throw err;
      ocrFailed = true;
      ocrError = err instanceof Error ? err.message : String(err);
      ocrText = null;
    }
    ocrMs = Date.now() - ocrStart;
  } else if (cached?.ocrTextRef) {
    ocrText = cached.ocrTextRef;
    ocrFailed = !ocrText;
    ocrProvider = 'cache';
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
  if (
    cached?.attachmentAnalysis &&
    typeof cached.attachmentAnalysis === 'object' &&
    !cachedLoyaltyAnalysisNeedsRerun(cached)
  ) {
    attachmentAnalysis = cached.attachmentAnalysis as Awaited<ReturnType<typeof buildAttachmentAnalysis>>;
    attachmentAnalysisMs = Date.now() - aaStart;
  } else {
    try {
      abortIfNeeded();
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
        runVisionEnrichment: input.runVisionEnrichment !== false,
        skipKernelSidecar: true,
        source: 'intake_evidence_barrier',
      });
      abortIfNeeded();
    } catch (analysisErr) {
      if ((analysisErr as Error & { code?: string })?.code === 'REQUEST_ABORTED') throw analysisErr;
      console.warn(
        '[KernelIngress] attachment analysis in barrier failed (non-fatal):',
        analysisErr instanceof Error ? analysisErr.message : analysisErr,
      );
    }
    attachmentAnalysisMs = Date.now() - aaStart;
  }

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
    imageRef,
  };
  const frozenBundle = saveIntakeEvidenceBundle(bundle);

  if (cacheKey && attachmentAnalysis) {
    setCachedAttachmentAnalysis(cacheKey, {
      evidenceId: passiveRun.evidenceView.evidenceId,
      ocrTextRef: snapshot.ocrText ?? null,
      documentType: attachmentAnalysis.artifactType ?? null,
      topologyResult: (attachmentAnalysis as { cardTopology?: unknown }).cardTopology ?? null,
      confidence: Number(attachmentAnalysis.confidence) || 0,
      attachmentAnalysis,
      completedAt: timing.completedAt,
    });
  }

  if (attachmentAnalysis) {
    attachmentAnalysis = stampEvidenceOnAttachmentAnalysis(attachmentAnalysis, {
      evidenceId: passiveRun.evidenceView.evidenceId,
      attachmentId: ingestion?.attachmentId ?? null,
      contentHash: ingestion?.contentHash ?? null,
      storeId: input.storeId ?? null,
      missionId: input.missionId ?? null,
      sessionId: input.sessionId ?? null,
    });
  }

  const analysisBundle = buildAnalysisBundleRecord({
    imageRef,
    evidenceId: passiveRun.evidenceView.evidenceId,
    attachmentId: ingestion?.attachmentId ?? null,
    attachmentAnalysis,
    completedAt: timing.completedAt,
  });

  const imageContext = {
    extractedText: snapshot.ocrText ?? '',
    provider: snapshot.ocrProvider,
    hasText: Boolean(snapshot.ocrText),
    ocrError: snapshot.ocrError,
    evidenceId: passiveRun.evidenceView.evidenceId,
    attachmentId: ingestion?.attachmentId ?? null,
    contentHash: ingestion?.contentHash ?? null,
    analysisBundle,
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

  if (Features.phase1.graphWriteTarget && input.missionId) {
    try {
      await applyIntakeEvidenceToGraph(
        input.missionId,
        frozenBundle as unknown as Record<string, unknown>,
        attachmentAnalysis as unknown as Record<string, unknown> | null,
      );
    } catch (graphErr) {
      console.warn(
        '[KernelIngress] applyIntakeEvidenceToGraph failed (non-fatal):',
        graphErr instanceof Error ? graphErr.message : graphErr,
      );
    }
  }

  if (Features.phase2.activeReasoning && input.missionId) {
    try {
      const reasoningResult = await runReasoningStep(input.missionId, {
        storeId: input.storeId ?? null,
        sessionId: input.sessionId ?? null,
        goal: input.userGoal ?? null,
        streamId,
      });
      if (Features.phase2.reasoningStepLog && process.env.NODE_ENV !== 'production') {
        console.info('[KernelIngress] reasoning_step_after_intake', {
          missionId: input.missionId,
          ok: reasoningResult?.ok,
          phase: reasoningResult?.graph?.phase,
          capabilityId: reasoningResult?.nextPlan?.capabilityId ?? null,
        });
      }
    } catch (reasoningErr) {
      console.warn(
        '[KernelIngress] runReasoningStep failed (non-fatal):',
        reasoningErr instanceof Error ? reasoningErr.message : reasoningErr,
      );
    }
  }

  return {
    status: 'ready',
    bundle: frozenBundle,
    imageContext,
    attachmentAnalysis,
  };
}

export type { IntakeEvidenceBarrierResult, IntakeEvidenceBundle } from './intakeEvidence.types.js';
