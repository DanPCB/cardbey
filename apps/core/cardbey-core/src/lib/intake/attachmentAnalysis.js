/**
 * AttachmentAnalysis — visual classify first, OCR enrichment only.
 * Core rule: OCR failure must never kill a loyalty-card mission.
 */

import { Features } from '../../config/features.js';
import { classifyUploadedAssetType } from './assetIntentIngestService.js';
import { emitSpinePathTelemetry } from './spinePathTelemetry.js';
import { recordAttachmentIngestSidecar } from '../kernel/attachmentRealityStreamSidecar.js';
import {
  enrichLoyaltyDraftWithMatrixTopology,
  parseStampMatrixSpec,
} from '../loyalty/loyaltyMatrixTopology.js';
import {
  alignLegacyFieldsWithCanonicalRule,
  hasAuthoritativeLoyaltyTopology,
  logLoyaltyContractDiagnostic,
} from '../loyalty/loyaltyContractDiagnostics.js';
import { attachLoyaltyEvidenceSignals } from '../loyalty/loyaltyVisualGridEvidence.js';
import {
  applyConfidenceSummaryToDraft,
  calibrateLoyaltyEvidenceConfidence,
} from '../loyalty/loyaltyConfidenceCalibration.js';
import {
  asMissionEvidenceGraph,
  mergeMissionEvidenceGraphs,
  summarizeMissionEvidenceGraph,
} from '../mission/missionEvidenceGraph.js';
import { buildLoyaltyMissionEvidenceGraph } from '../mission/loyaltyMissionEvidence.js';
import {
  loyaltyTopologyNeedsOcrReconcile,
  tryReconcileLoyaltyFromOcr,
} from '../loyalty/loyaltyTopologyOcrReconcile.js';
import { isStrongGptGridVisionResult } from '../loyalty/loyaltyCardGridVisionExtract.js';

/**
 * @typedef {{
 *   artifactType: 'loyalty_card' | 'business_card' | 'menu' | 'unknown' | string;
 *   visualHints: string[];
 *   confidence: number;
 *   ocrStatus: 'ok' | 'weak' | 'failed' | 'skipped';
 *   ocrWarning: string | null;
 *   ocrText: string | null;
 *   preseededDraft: Record<string, unknown> | null;
 *   missingFields: string[];
 *   confirmedFields?: { reward?: string; requiredStamps?: number } | null;
 *   missionEvidenceGraph?: import('../mission/missionEvidenceGraph.js').MissionEvidenceGraph | null;
 *   missionEvidenceSummary?: Record<string, unknown> | null;
 *   source: string;
 * }} AttachmentAnalysis
 */

/** Confidence at/above which reward+stamps are treated as confirmed smart defaults. */
export const LOYALTY_SMART_DEFAULT_CONFIDENCE = 0.75;

const STAMP_LAYOUT_CUES =
  /\b(stamp|stamps|punch|buy\s+\d+|get\s+\d+|free\s+\w+|coffee\s+free|rewards?|loyalty|coffee\s+club|member)\b/i;

const STAMP_GRID_FOOTER_NOISE =
  /\b(catering|available|valid|expires|terms|conditions|thank\s+you)\b/i;

/**
 * Cheap structural / text cues for loyalty stamp cards (no provider required).
 *
 * @param {{
 *   filename?: string | null;
 *   mimeType?: string | null;
 *   ocrText?: string | null;
 *   userMessage?: string | null;
 * }} input
 */
export function detectLoyaltyCardVisualHints(input = {}) {
  /** @type {string[]} */
  const hints = [];
  const name = String(input.filename ?? '').toLowerCase();
  const ocr = String(input.ocrText ?? '');
  const msg = String(input.userMessage ?? '');

  if (/loyalty|stamp|rewards?|punch/.test(name)) hints.push('filename_loyalty');
  if (STAMP_LAYOUT_CUES.test(ocr)) hints.push('ocr_stamp_language');
  if (STAMP_LAYOUT_CUES.test(msg)) hints.push('user_loyalty_language');
  if (/\bcoffee\b|\bcafe\b|\bcafé\b/i.test(`${ocr} ${msg} ${name}`)) hints.push('coffee_shop');
  if (
    /\bstamp\b|\bpunch\b|\b\d+\s*(stamps?|visits?|purchases?)\b/i.test(`${ocr} ${name}`) ||
    /\bbuy\s+\d+/i.test(ocr) ||
    /\bget\s+(a\s+)?free\b/i.test(ocr) ||
    /\bcoffee\s+free\b/i.test(ocr)
  ) {
    hints.push('stamp_grid');
  }
  if (detectRepeatedStampGridLines(ocr)) {
    hints.push('stamp_grid');
    hints.push('ocr_stamp_grid_repetition');
  }
  if (
    hints.some(
      (h) =>
        h === 'filename_loyalty' ||
        h === 'ocr_stamp_language' ||
        h === 'user_loyalty_language' ||
        h === 'stamp_grid',
    )
  ) {
    hints.push('reward_program_candidate');
  }
  return [...new Set(hints)];
}

/**
 * Detect grid-like stamp OCR (repeated "Coffee" rows ending in "Coffee Free").
 * @param {string | null | undefined} ocrText
 */
function detectRepeatedStampGridLines(ocrText) {
  const lines = String(ocrText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !STAMP_GRID_FOOTER_NOISE.test(line) || /\bcoffee\b/i.test(line));
  if (lines.length < 6) return false;
  const freeLines = lines.filter((line) => /\b(coffee\s+free|free\s+coffee)\b/i.test(line));
  const stampLines = lines.filter(
    (line) => /\bcoffee\b/i.test(line) && !/\b(coffee\s+free|free\s+coffee)\b/i.test(line),
  );
  return freeLines.length >= 2 && stampLines.length >= 4;
}

/**
 * Infer stamp-card reward + visit count from grid OCR (e.g. 4× Coffee + Coffee Free rows).
 * @param {string | null | undefined} ocrText
 * @returns {Record<string, unknown> | null}
 */
export function inferLoyaltyStampGridFromOcr(ocrText) {
  const raw = String(ocrText ?? '').trim();
  if (!raw) return null;

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !STAMP_GRID_FOOTER_NOISE.test(line) || /\bcoffee\b/i.test(line));

  const freeLines = lines.filter((line) =>
    /\b(coffee\s+free|free\s+coffee)\b/i.test(line),
  );
  const stampLines = lines.filter(
    (line) => /\bcoffee\b/i.test(line) && !/\b(coffee\s+free|free\s+coffee)\b/i.test(line),
  );

  const perLineCoffee = lines.filter((line) => /^coffee$/i.test(line.trim()));
  const perLineFree = lines.filter((line) => /^free$/i.test(line.trim()));
  if (
    perLineFree.length >= 1 &&
    perLineCoffee.length >= perLineFree.length * 2 &&
    perLineCoffee.length % perLineFree.length === 0
  ) {
    const rows = perLineFree.length;
    const purchasesPerRow = perLineCoffee.length / rows;
    const freePerRow = 1;
    return {
      requiredStamps: purchasesPerRow,
      reward: 'Free coffee',
      matrix: { rows, purchasesPerRow, freePerRow },
      totalPurchaseCells: rows * purchasesPerRow,
      totalCells: rows * (purchasesPerRow + freePerRow),
      confidence: rows >= 2 ? 0.92 : 0.86,
      programType: 'stamp_card',
      inferredFrom: 'ocr_stamp_grid_token_lines',
    };
  }

  if (!freeLines.length && !stampLines.length) {
    const freeCount = (raw.match(/\bfree\b/gi) || []).length;
    const coffeeCount = (raw.match(/\bcoffee\b/gi) || []).length;
    if (freeCount >= 1 && coffeeCount > freeCount) {
      const rows = freeCount;
      const purchasesPerRow = coffeeCount / rows;
      if (Number.isInteger(purchasesPerRow) && purchasesPerRow >= 2) {
        return {
          requiredStamps: purchasesPerRow,
          reward: 'Free coffee',
          matrix: { rows, purchasesPerRow, freePerRow: 1 },
          totalPurchaseCells: rows * purchasesPerRow,
          totalCells: rows * (purchasesPerRow + 1),
          confidence: rows >= 2 ? 0.9 : 0.82,
          programType: 'stamp_card',
          inferredFrom: 'ocr_stamp_grid_counts',
        };
      }
      const stampsBetween = Math.max(2, Math.round((coffeeCount - freeCount) / freeCount) + 1);
      return {
        requiredStamps: stampsBetween,
        reward: 'Free coffee',
        confidence: 0.78,
        programType: 'stamp_card',
        inferredFrom: 'ocr_stamp_grid_counts_partial',
      };
    }
    return null;
  }

  let requiredStamps = null;
  /** @type {{ rows: number; purchasesPerRow: number; freePerRow: number } | null} */
  let matrix = null;
  if (freeLines.length > 0 && stampLines.length > 0) {
    const rows = freeLines.length;
    const purchasesPerRow = Math.max(1, Math.round(stampLines.length / freeLines.length));
    const freePerRow = 1;
    matrix = { rows, purchasesPerRow, freePerRow };
    requiredStamps = purchasesPerRow;
  }

  let reward = 'Free coffee';
  const freeLine = freeLines[0] ?? '';
  if (/\bfree\b/i.test(freeLine)) {
    const item = freeLine
      .replace(/\bfree\b/gi, '')
      .replace(/\bcoffee\b/gi, '')
      .trim();
    reward = item ? `Free ${item}` : 'Free coffee';
    if (/^free$/i.test(reward)) reward = 'Free coffee';
  }

  if (!requiredStamps || requiredStamps < 2) {
    return {
      reward,
      requiredStamps: null,
      matrix,
      confidence: 0.72,
      programType: 'stamp_card',
      inferredFrom: 'ocr_stamp_grid_partial',
    };
  }

  return {
    requiredStamps,
    reward,
    matrix,
    totalPurchaseCells: matrix ? matrix.rows * matrix.purchasesPerRow : null,
    totalCells: matrix ? matrix.rows * (matrix.purchasesPerRow + matrix.freePerRow) : null,
    confidence: 0.82,
    programType: 'stamp_card',
    inferredFrom: 'ocr_stamp_grid_lines',
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} draft
 * @returns {string[]}
 */
export function listMissingLoyaltyDraftFields(draft) {
  /** @type {string[]} */
  const missing = [];
  if (!draft || typeof draft !== 'object') {
    return ['requiredStamps', 'reward', 'storeId'];
  }
  const stamps = Number(draft.requiredStamps);
  if (!Number.isFinite(stamps) || stamps < 1) missing.push('requiredStamps');
  if (!String(draft.reward ?? draft.rewardRule ?? '').trim()) missing.push('reward');
  return missing;
}

/**
 * Build AttachmentAnalysis from available signals. Never throws for OCR failure.
 *
 * @param {{
 *   filename?: string | null;
 *   mimeType?: string | null;
 *   imageDataUrl?: string | null;
 *   imageUrl?: string | null;
 *   ocrText?: string | null;
 *   ocrFailed?: boolean;
 *   userMessage?: string | null;
 *   storeName?: string | null;
 *   storeId?: string | null;
 *   runVisionEnrichment?: boolean;
 *   sessionId?: string | null;
 *   missionId?: string | null;
 *   fileAssetId?: string | null;
 *   ocrProvider?: string | null;
 *   source?: string | null;
 *   skipKernelSidecar?: boolean;
 * }} input
 * @returns {Promise<AttachmentAnalysis>}
 */
export async function buildAttachmentAnalysis(input = {}) {
  const ocrText = String(input.ocrText ?? '').trim() || null;
  const ocrFailed = input.ocrFailed === true || (!ocrText && input.ocrFailed !== false && input.imageDataUrl);
  const filenameHints = classifyUploadedAssetType({
    filename: input.filename,
    mimeType: input.mimeType,
    ocrHints: ocrText ? { rawText: ocrText } : null,
  });
  const visualHints = detectLoyaltyCardVisualHints({
    filename: input.filename,
    mimeType: input.mimeType,
    ocrText,
    userMessage: input.userMessage,
  });

  let artifactType =
    filenameHints === 'loyalty_card' || visualHints.includes('reward_program_candidate')
      ? 'loyalty_card'
      : filenameHints;

  /** @type {Record<string, unknown> | null} */
  let preseededDraft = null;
  /** @type {import('../mission/missionEvidenceGraph.js').MissionEvidenceGraph | null} */
  let missionEvidenceGraph = null;
  let visionConfidence = artifactType === 'loyalty_card' ? 0.72 : 0.4;

  const shouldEnrich =
    input.runVisionEnrichment !== false &&
    artifactType === 'loyalty_card' &&
    Boolean(input.imageUrl || input.imageDataUrl);

  /** @type {import('../kernel/attachmentRealityStreamSidecar.js').AttachmentIngestSidecarInput['visionResult'] | null} */
  let visionResultForStream = null;

  if (shouldEnrich) {
    try {
      const { extractLoyaltyCardFromImage } = await import(
        '../toolExecutors/loyalty/loyaltyCardVisionExtract.js'
      );
      const imageUrl = String(input.imageUrl || input.imageDataUrl || '').trim();
      const extracted = await extractLoyaltyCardFromImage({
        imageUrl,
        storeName: input.storeName ?? null,
        missionId: input.missionId ?? null,
        evidenceId: input.evidenceId ?? null,
      });
      if (extracted?.preseededDraft && typeof extracted.preseededDraft === 'object') {
        const draft = extracted.preseededDraft;
        visionResultForStream = {
          ok: extracted?.ok === true,
          ocrText: extracted?.ocrText ?? null,
          extractedFields: {
            programName: draft.programName ?? null,
            requiredStamps: draft.requiredStamps ?? null,
            reward: draft.reward ?? null,
            confidence: draft.confidence ?? null,
            programType: draft.programType ?? null,
          },
          provider: 'loyalty_card_vision_extract',
          error:
            extracted?.ok === false
              ? String(extracted?.error?.message ?? extracted?.error ?? 'vision_failed')
              : null,
        };
      } else if (extracted) {
        visionResultForStream = {
          ok: extracted?.ok === true,
          ocrText: extracted?.ocrText ?? null,
          extractedFields: null,
          provider: 'loyalty_card_vision_extract',
          error:
            extracted?.ok === false
              ? String(extracted?.error?.message ?? extracted?.error ?? 'vision_failed')
              : null,
        };
      }
      if (extracted?.ok && extracted.preseededDraft) {
        preseededDraft = {
          ...extracted.preseededDraft,
          storeId: input.storeId ?? extracted.preseededDraft.storeId ?? null,
        };
        if (
          ocrText &&
          loyaltyTopologyNeedsOcrReconcile(preseededDraft.cardTopology, ocrText) &&
          !isStrongGptGridVisionResult({
            cardTopology: preseededDraft.cardTopology,
            extractionMethod: preseededDraft.topologyExtractionMethod,
            confidence: preseededDraft.layoutConfidence,
          })
        ) {
          const reconciled = tryReconcileLoyaltyFromOcr(ocrText, preseededDraft);
          if (reconciled?.preseededDraft) {
            preseededDraft = reconciled.preseededDraft;
          }
        }
        if (extracted.missionEvidenceGraph) {
          missionEvidenceGraph = asMissionEvidenceGraph(extracted.missionEvidenceGraph);
        }
        logLoyaltyContractDiagnostic('extractLoyaltyCardFromImage', preseededDraft, {
          missionId: input.missionId ?? null,
        });
        visionConfidence = Math.max(
          visionConfidence,
          Number(extracted.preseededDraft.confidence) || visionConfidence,
        );
        artifactType = 'loyalty_card';
        if (!visualHints.includes('stamp_grid')) visualHints.push('stamp_grid');
        if (!visualHints.includes('reward_program_candidate')) {
          visualHints.push('reward_program_candidate');
        }
      }
      // Even if OCR-ish extract is weak, keep loyalty type from visual path.
      if (!ocrText && extracted?.ocrText) {
        // enrichment text only — does not override visual type on empty
      }
    } catch (err) {
      console.warn(
        '[AttachmentAnalysis] vision enrichment failed (non-fatal):',
        err?.message ?? err,
      );
    }
  }

  // Heuristic: attachment-only image with no OCR must not become business_card / unknown dead-end.
  const useLoyaltySpine =
    Features?.loyalty?.useSpine === true ||
    String(process.env.USE_LOYALTY_SPINE ?? '').toLowerCase() === 'true';
  if (
    useLoyaltySpine &&
    input.attachmentOnlyUpload === true &&
    !ocrText &&
    (artifactType === 'unknown' || artifactType === 'business_card')
  ) {
    artifactType = 'loyalty_card';
    if (!visualHints.includes('reward_program_candidate')) {
      visualHints.push('reward_program_candidate');
    }
    visualHints.push('attachment_only_ocr_failed_loyalty_candidate');
    visionConfidence = Math.max(visionConfidence, 0.7);
  }

  if (
    artifactType === 'loyalty_card' &&
    ocrText &&
    !hasAuthoritativeLoyaltyTopology(preseededDraft?.cardTopology)
  ) {
    try {
      const { extractLoyaltyCardTopology } = await import('../loyalty/loyaltyTopologyExtraction.js');
      const topoResult = await extractLoyaltyCardTopology({
        ocrText,
        storeId: input.storeId ?? null,
        missionId: input.missionId ?? null,
        storeName: input.storeName ?? null,
      });
      if (topoResult?.ok && topoResult.cardTopology) {
        preseededDraft = {
          ...(preseededDraft && typeof preseededDraft === 'object' ? preseededDraft : {}),
          programName:
            preseededDraft?.programName ??
            (input.storeName ? `${input.storeName} Rewards` : 'Loyalty Rewards'),
          cardTopology: topoResult.cardTopology,
          rule: topoResult.rule ?? preseededDraft?.rule ?? null,
          cardFooterText:
            topoResult.cardTopology?.footerText ?? preseededDraft?.cardFooterText ?? null,
          layoutSource: topoResult.cardTopology?.source ?? 'VISION_EXTRACTED',
          layoutConfidence: topoResult.cardTopology?.confidence ?? null,
          topologyReviewRequired: Boolean(topoResult.cardTopology?.reviewRequired),
          extractedFromImage: true,
          imageAssetId: input.imageUrl || input.imageDataUrl || preseededDraft?.imageAssetId || null,
          storeId: input.storeId ?? preseededDraft?.storeId ?? null,
          programType: 'stamp_card',
        };
        preseededDraft = alignLegacyFieldsWithCanonicalRule(preseededDraft);
        logLoyaltyContractDiagnostic('extractLoyaltyCardTopology', preseededDraft, {
          missionId: input.missionId ?? null,
        });
        visionConfidence = Math.max(
          visionConfidence,
          Number(topoResult.cardTopology?.confidence) || visionConfidence,
        );
      }
    } catch (topoErr) {
      console.warn(
        '[AttachmentAnalysis] loyalty topology extraction failed (non-fatal):',
        topoErr?.message ?? topoErr,
      );
    }
  }

  // Heuristic partial draft when vision enrich skipped / weak.
  if (artifactType === 'loyalty_card' && !preseededDraft) {
    const stampMatch = String(ocrText ?? '').match(/\b(\d{1,2})\s*(stamps?|visits?|purchases?)\b/i);
    const stamps = stampMatch ? Number(stampMatch[1]) : null;
    const gridInference = inferLoyaltyStampGridFromOcr(ocrText);
    preseededDraft = {
      programName: input.storeName ? `${input.storeName} Rewards` : 'Loyalty Rewards',
      requiredStamps:
        Number.isFinite(stamps) && stamps >= 1
          ? stamps
          : Number(gridInference?.requiredStamps) >= 1
            ? Number(gridInference.requiredStamps)
            : null,
      reward: String(gridInference?.reward ?? '').trim() || null,
      confidence: Math.max(
        visionConfidence,
        Number(gridInference?.confidence) || visionConfidence,
      ),
      extractedFromImage: true,
      programType: 'stamp_card',
      storeId: input.storeId ?? null,
      imageAssetId: input.imageUrl || input.imageDataUrl || null,
      ...(gridInference?.inferredFrom ? { inferredFrom: gridInference.inferredFrom } : {}),
    };
    if (Number(preseededDraft.confidence) > visionConfidence) {
      visionConfidence = Number(preseededDraft.confidence);
    }
    if (
      gridInference &&
      Number(gridInference.confidence) >= LOYALTY_SMART_DEFAULT_CONFIDENCE &&
      !visualHints.includes('stamp_grid')
    ) {
      visualHints.push('stamp_grid');
    }
  }

  if (artifactType === 'loyalty_card' && preseededDraft && typeof preseededDraft === 'object') {
    const matrixFromMessage = parseStampMatrixSpec(input.userMessage);
    if (matrixFromMessage && !hasAuthoritativeLoyaltyTopology(preseededDraft.cardTopology)) {
      preseededDraft = enrichLoyaltyDraftWithMatrixTopology(
        { ...preseededDraft, matrix: matrixFromMessage },
        {
          userMessage: input.userMessage,
          purchaseItem: 'Coffee',
          rewardItem: String(preseededDraft.reward ?? preseededDraft.rewardRule ?? 'Free coffee').trim(),
          source: 'MATRIX_SPEC',
          forceMatrix: matrixFromMessage,
        },
      );
    } else {
      preseededDraft = alignLegacyFieldsWithCanonicalRule(preseededDraft);
    }
    logLoyaltyContractDiagnostic('enrichLoyaltyDraftWithMatrixTopology', preseededDraft, {
      missionId: input.missionId ?? null,
    });
    if (Number(preseededDraft.confidence) > visionConfidence) {
      visionConfidence = Number(preseededDraft.confidence);
    } else if (Number(preseededDraft.layoutConfidence) > visionConfidence) {
      visionConfidence = Number(preseededDraft.layoutConfidence);
    }
  }

  if (artifactType === 'loyalty_card' && preseededDraft && typeof preseededDraft === 'object') {
    preseededDraft = attachLoyaltyEvidenceSignals(preseededDraft, { ocrText });
    const gridInference = inferLoyaltyStampGridFromOcr(ocrText);
    const confidenceSummary = calibrateLoyaltyEvidenceConfidence({
      visualGridEvidence: preseededDraft.visualGridEvidence,
      semanticTextEvidence: preseededDraft.semanticTextEvidence,
      cardTopology: preseededDraft.cardTopology,
      ocrInferredRows: gridInference?.rows ?? null,
      ocrInferredColumns: gridInference?.columns ?? null,
    });
    preseededDraft = applyConfidenceSummaryToDraft(preseededDraft, confidenceSummary);
    visionConfidence = Math.max(visionConfidence, confidenceSummary.overallConfidence);
    if (!missionEvidenceGraph) {
      missionEvidenceGraph = buildLoyaltyMissionEvidenceGraph({
        missionId: input.missionId ?? null,
        evidenceId: input.evidenceId ?? null,
        ocrText,
        preseededDraft,
        priorGraph: null,
      });
    } else {
      missionEvidenceGraph = mergeMissionEvidenceGraphs(
        missionEvidenceGraph,
        buildLoyaltyMissionEvidenceGraph({
          missionId: input.missionId ?? null,
          evidenceId: input.evidenceId ?? null,
          ocrText,
          preseededDraft,
          priorGraph: missionEvidenceGraph,
        }),
      );
    }
  }

  let missingFields =
    artifactType === 'loyalty_card' ? listMissingLoyaltyDraftFields(preseededDraft) : [];

  /** @type {{ reward: string; requiredStamps: number } | null} */
  let confirmedFields = null;
  if (artifactType === 'loyalty_card' && preseededDraft && typeof preseededDraft === 'object') {
    const reward = String(preseededDraft.reward ?? preseededDraft.rewardRule ?? '').trim();
    const stamps = Number(preseededDraft.requiredStamps ?? preseededDraft.stampThreshold);
    if (
      visionConfidence >= LOYALTY_SMART_DEFAULT_CONFIDENCE &&
      reward &&
      Number.isFinite(stamps) &&
      stamps >= 1
    ) {
      confirmedFields = { reward, requiredStamps: stamps };
      missingFields = [];
    }
  }

  let ocrStatus = /** @type {AttachmentAnalysis['ocrStatus']} */ ('skipped');
  let ocrWarning = /** @type {string | null} */ (null);
  if (ocrText) {
    ocrStatus = ocrText.length < 12 || !STAMP_LAYOUT_CUES.test(ocrText) ? 'weak' : 'ok';
    if (ocrStatus === 'weak') {
      ocrWarning = 'OCR returned little usable text; using visual classification.';
    }
  } else if (input.imageDataUrl || input.imageUrl || ocrFailed) {
    ocrStatus = 'failed';
    ocrWarning =
      'Could not read enough text from the image. Continuing from visual loyalty-card detection.';
  }

  const analysis = {
    artifactType,
    visualHints,
    confidence: visionConfidence,
    ocrStatus,
    ocrWarning,
    ocrText,
    preseededDraft,
    missingFields,
    confirmedFields,
    ...(missionEvidenceGraph
      ? {
          missionEvidenceGraph,
          missionEvidenceSummary: summarizeMissionEvidenceGraph(missionEvidenceGraph),
        }
      : {}),
    source: 'attachment_analysis_p1',
  };

  if (Features.businessUnderstanding?.enabled) {
    try {
      const { runBusinessUnderstandingPipeline } = await import(
        '../businessUnderstanding/businessUnderstandingPipeline.js'
      );
      const bueResult = await runBusinessUnderstandingPipeline({
        imageUrl: input.imageUrl ?? null,
        imageDataUrl: input.imageDataUrl ?? null,
        filename: input.filename ?? null,
        mimeType: input.mimeType ?? null,
        ocrText,
        userMessage: input.userMessage ?? null,
        storeName: input.storeName ?? null,
        storeId: input.storeId ?? null,
        missionId: input.missionId ?? null,
        evidenceId: input.evidenceId ?? null,
        ownerId: input.ownerId ?? null,
        visualHints,
        priorArtifactType: artifactType,
        preseededDraft,
        cardTopology: preseededDraft?.cardTopology ?? null,
        rule: preseededDraft?.rule ?? null,
        digitizeExisting: artifactType === 'loyalty_card',
        documentExtraction: input.documentExtraction ?? null,
      });
      if (bueResult?.ok && bueResult.bundle) {
        analysis.businessUnderstanding = bueResult.bundle;
        analysis.merchantUnderstandingSummary = bueResult.merchantSummary ?? null;
        if (bueResult.documentInterpretation?.ok) {
          analysis.documentTopology = bueResult.documentInterpretation.topology ?? null;
        }
        if (bueResult.channelComposition) {
          analysis.channelComposition = bueResult.channelComposition;
        }
      }
    } catch (bueErr) {
      console.warn(
        '[AttachmentAnalysis] business understanding pipeline failed (non-fatal):',
        bueErr?.message ?? bueErr,
      );
    }
  }

  emitSpinePathTelemetry({
    pathId:
      artifactType === 'loyalty_card' ? 'loyalty_attachment_analysis' : 'attachment_analysis',
    source: 'attachment_analysis',
    ok: true,
    reason: ocrStatus === 'failed' ? 'ocr_weak_visual_continue' : 'analyzed',
    tool: artifactType === 'loyalty_card' ? 'setup_loyalty_program' : null,
    spine: artifactType === 'loyalty_card',
  });

  if (input.skipKernelSidecar !== true) {
    recordAttachmentIngestSidecar({
      sessionId: input.sessionId ?? null,
      missionId: input.missionId ?? null,
      fileAssetId: input.fileAssetId ?? null,
      source: input.source ?? 'attachment_analysis',
      filename: input.filename ?? null,
      mimeType: input.mimeType ?? null,
      imageRef: input.imageUrl || input.imageDataUrl || null,
      userGoal: input.userMessage ?? null,
      ocrText,
      ocrFailed,
      ocrProvider: input.ocrProvider ?? null,
      visionResult: visionResultForStream,
    });
  }

  return analysis;
}

/**
 * Human-readable perception line for intake / mission UI.
 * @param {AttachmentAnalysis} analysis
 */
export function formatAttachmentAnalysisMessage(analysis) {
  if (analysis.artifactType === 'loyalty_card') {
    const warn = analysis.ocrWarning
      ? ` ${analysis.ocrWarning}`
      : analysis.ocrStatus === 'failed' || analysis.ocrStatus === 'weak'
        ? ' I could not read enough text from it.'
        : '';
    return `I can see this looks like a loyalty stamp card.${warn}`.trim();
  }
  return analysis.ocrWarning || 'I looked at the uploaded image.';
}

/**
 * Clarify payload when loyalty is locked but draft fields are incomplete.
 * High-confidence reward+stamps → confirm summary instead of blank asks.
 * @param {AttachmentAnalysis} analysis
 * @param {{ storeId?: string | null }} [ctx]
 */
export function buildLoyaltyMissingFieldsClarify(analysis, ctx = {}) {
  const draft = analysis.preseededDraft && typeof analysis.preseededDraft === 'object'
    ? analysis.preseededDraft
    : null;
  const confirmed =
    analysis.confirmedFields && typeof analysis.confirmedFields === 'object'
      ? analysis.confirmedFields
      : null;
  const reward = String(confirmed?.reward ?? draft?.reward ?? draft?.rewardRule ?? '').trim();
  const stamps = Number(
    confirmed?.requiredStamps ?? draft?.requiredStamps ?? draft?.stampThreshold,
  );
  const bothKnownHighConfidence =
    Number(analysis.confidence) >= LOYALTY_SMART_DEFAULT_CONFIDENCE &&
    Boolean(reward) &&
    Number.isFinite(stamps) &&
    stamps >= 1 &&
    (!analysis.missingFields || analysis.missingFields.length === 0);

  const missing = bothKnownHighConfidence
    ? []
    : analysis.missingFields?.length
      ? analysis.missingFields
      : listMissingLoyaltyDraftFields(analysis.preseededDraft);
  const needsStore = !String(ctx.storeId ?? analysis.preseededDraft?.storeId ?? '').trim();
  const parts = [formatAttachmentAnalysisMessage(analysis)];
  if (needsStore) parts.push('Which store should I use?');
  if (bothKnownHighConfidence) {
    parts.push(`I detected Reward: ${reward} ✓ Visits: ${stamps} ✓ Continue?`);
  } else if (missing.includes('reward') || missing.includes('requiredStamps')) {
    parts.push('What reward should customers receive, and after how many stamps?');
  }
  return {
    success: true,
    action: 'clarify',
    clarifyType: bothKnownHighConfidence ? 'loyalty_confirm_defaults' : 'loyalty_missing_fields',
    response: parts.join(' ').trim(),
    attachmentAnalysis: analysis,
    ocrWarning: analysis.ocrWarning,
    options: [
      {
        label: bothKnownHighConfidence ? 'Continue' : 'Continue loyalty setup',
        tool: 'setup_loyalty_program',
        parameters: {
          storeId: ctx.storeId ?? analysis.preseededDraft?.storeId ?? undefined,
          preseededDraft: analysis.preseededDraft,
          confirmedFields: bothKnownHighConfidence
            ? { reward, requiredStamps: stamps }
            : analysis.confirmedFields ?? undefined,
          source: bothKnownHighConfidence
            ? 'loyalty_confirm_defaults_continue'
            : 'loyalty_missing_fields_continue',
        },
      },
    ],
    pendingIntent: {
      tool: 'setup_loyalty_program',
      originalTool: 'setup_loyalty_program',
      lockedIntent: 'setup_loyalty_program',
      preseededDraft: analysis.preseededDraft,
      attachmentAnalysis: analysis,
    },
  };
}

/**
 * @param {AttachmentAnalysis | null | undefined} analysis
 */
export function isLoyaltyCardAttachment(analysis) {
  return analysis?.artifactType === 'loyalty_card';
}
