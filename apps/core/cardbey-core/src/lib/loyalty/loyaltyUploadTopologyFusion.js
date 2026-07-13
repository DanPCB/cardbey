/**
 * Geometry-first topology fusion at loyalty card upload (before mission compile).
 */

import { detectStampGridFromImage } from './loyaltyStampGridDetector.js';
import { fuseTopologyResults } from './topologyFusion.js';
import {
  hasAuthoritativeLoyaltyTopology,
} from './loyaltyContractDiagnostics.js';
import {
  buildCardTopologyFromDetection,
  buildVisualGridEvidenceFromTopology,
} from './loyaltyVisualGridEvidence.js';
import { emitLoyaltyTopologyTelemetry } from './loyaltyTopologyTelemetry.js';
import {
  extractOcrFooterText,
  parseLoyaltyCardTopologyFromOcr,
} from './loyaltyOcrTopologyParser.js';
import { buildLoyaltyCardTopologyFromDetected } from './loyaltyTopologyBuild.js';
import { inferRuleFromTopology } from './loyaltyRuleInference.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {{ topologyResult?: { ok?: boolean; rule?: import('./loyaltyTopologyTypes.js').LoyaltyProgramRule | null; cardTopology?: import('./loyaltyTopologyTypes.js').LoyaltyCardTopology | null; extractionMethod?: string | null }; ocrText?: string | null; rules?: Record<string, unknown> | null }} input
 */
function enrichOcrFusionFromParsedText(ocrText, footerText) {
  const parsed = parseLoyaltyCardTopologyFromOcr(ocrText);
  if (!parsed?.detected) return null;

  const detected = parsed.detected;
  const cardTopology = buildLoyaltyCardTopologyFromDetected(
    {
      ...detected,
      footerText: footerText ?? detected.footerText,
    },
    { source: 'VISION_EXTRACTED' },
  );
  if (!cardTopology) return null;

  const purchasesPerRow =
    detected.repeatedPattern?.roles?.filter((role) => role === 'PURCHASE').length ??
    Math.max(1, (detected.columns ?? 0) - 1);

  return {
    cardTopology,
    source: parsed.method,
    confidence: Number(cardTopology.confidence) || Number(detected.overallConfidence) || 0.88,
    rows: cardTopology.rows ?? null,
    columns: cardTopology.columns ?? null,
    stampThreshold: purchasesPerRow > 0 ? purchasesPerRow : null,
    purchaseItemHint: parsed.purchaseItemHint,
    rewardItemHint: parsed.rewardItemHint,
  };
}

export function buildOcrFusionInput(input = {}) {
  const topologyResult = input.topologyResult ?? {};
  let cardTopology = topologyResult.ok ? topologyResult.cardTopology ?? null : null;
  const rule = topologyResult.ok ? topologyResult.rule ?? null : null;
  const rules = input.rules && typeof input.rules === 'object' ? input.rules : {};
  const ocrText = String(input.ocrText ?? '').trim();
  const footerText = extractOcrFooterText(ocrText);

  let ocrSource = pickString(topologyResult.extractionMethod) || (cardTopology ? 'ocr_topology' : 'none');
  let ocrConfidence =
    Number(cardTopology?.confidence) ||
    Number(rules.confidence) ||
    (ocrText ? 0.5 : 0);
  let stampThreshold =
    rule?.purchasesRequired ??
    (Number(rules.stampsRequired) > 0 ? Number(rules.stampsRequired) : null);
  let purchaseItemHint = pickString(rule?.purchaseItem, rules.purchaseItem);
  let rewardItemHint = pickString(rule?.rewardItem, rules.rewardDescription, rules.reward);

  if (!cardTopology && ocrText) {
    const enriched = enrichOcrFusionFromParsedText(ocrText, footerText);
    if (enriched?.cardTopology) {
      cardTopology = enriched.cardTopology;
      ocrSource = enriched.source;
      ocrConfidence = enriched.confidence;
      stampThreshold = enriched.stampThreshold ?? stampThreshold;
      purchaseItemHint = pickString(enriched.purchaseItemHint, purchaseItemHint);
      rewardItemHint = pickString(enriched.rewardItemHint, rewardItemHint);
    }
  }

  return {
    source: ocrSource,
    confidence: ocrConfidence,
    rows: cardTopology?.rows ?? null,
    columns: cardTopology?.columns ?? null,
    detectedLayout:
      cardTopology?.rows && cardTopology?.columns
        ? `${cardTopology.rows}x${cardTopology.columns}`
        : null,
    stampThreshold,
    buyGetRule:
      stampThreshold && rule?.rewardQuantity
        ? { buy: stampThreshold, get: rule.rewardQuantity }
        : stampThreshold
          ? { buy: stampThreshold, get: 1 }
          : null,
    footerText: cardTopology?.footerText ?? footerText,
    purchaseItemHint,
    rewardItemHint,
    cardTopology,
  };
}

/**
 * @param {Awaited<ReturnType<typeof detectStampGridFromImage>> | null | undefined} detection
 */
export function buildVisualFusionInput(detection) {
  if (!detection || detection.success !== true) {
    return {
      source: detection?.source ?? 'none',
      confidence: Number(detection?.confidence) || 0,
      rows: detection?.rows ?? null,
      columns: detection?.columns ?? null,
      layout: detection?.layout ?? null,
      estimatedThreshold: detection?.estimatedThreshold ?? null,
      footerText: detection?.footerText ?? null,
      cardTopology: null,
      success: false,
    };
  }

  const cardTopology = buildCardTopologyFromDetection(detection);
  return {
    source: detection.source ?? 'visual_grid_detector',
    confidence: Number(detection.confidence) || 0,
    rows: detection.rows ?? null,
    columns: detection.columns ?? null,
    layout: detection.layout ?? null,
    estimatedThreshold: detection.estimatedThreshold ?? null,
    footerText: detection.footerText ?? null,
    cardTopology,
    success: true,
  };
}

/**
 * @param {string} imageUrl
 * @param {{ ocrText?: string | null; missionId?: string | null; storeId?: string | null }} [ctx]
 */
export async function detectVisualGridForUpload(imageUrl, ctx = {}) {
  try {
    const detection = await detectStampGridFromImage(imageUrl, { ocrText: ctx.ocrText ?? null });
    emitLoyaltyTopologyTelemetry('loyalty_topology_cv_detected', {
      missionId: ctx.missionId ?? null,
      storeId: ctx.storeId ?? null,
      rows: detection.rows ?? null,
      columns: detection.columns ?? null,
      confidence: detection.confidence ?? null,
      success: detection.success === true,
      source: detection.source ?? 'visual_grid_detector',
    });
    return detection;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitLoyaltyTopologyTelemetry('loyalty_topology_cv_failed', {
      missionId: ctx.missionId ?? null,
      storeId: ctx.storeId ?? null,
      reason: message,
    });
    return {
      success: false,
      source: 'visual_grid_detector',
      confidence: 0,
      rows: null,
      columns: null,
      layout: null,
      estimatedThreshold: null,
      rewardCells: [],
      footerText: null,
      cvError: message,
    };
  }
}

function isStrongOcrTokenGrid(ocrResult) {
  if (!ocrResult?.cardTopology || Number(ocrResult.confidence) < 0.85) return false;
  return /ocr_token|ocr_stamp_row|ocr_stamp_grid/i.test(String(ocrResult.source ?? ''));
}

/**
 * Prefer CV geometry when it is authoritative or disagrees with OCR/LLM layout.
 *
 * @param {{
 *   visualDetection?: Awaited<ReturnType<typeof detectStampGridFromImage>> | null;
 *   topologyResult?: { ok?: boolean; rule?: import('./loyaltyTopologyTypes.js').LoyaltyProgramRule | null; cardTopology?: import('./loyaltyTopologyTypes.js').LoyaltyCardTopology | null; extractionMethod?: string | null };
 *   ocrText?: string | null;
 *   rules?: Record<string, unknown> | null;
 *   preferVisionGrid?: boolean;
 * }} input
 */
export function fuseUploadTopology(input = {}) {
  const topologyResult = input.topologyResult ?? {};
  const topologyExtractionMethod = String(topologyResult.extractionMethod ?? '');

  if (
    (input.preferVisionGrid === true || topologyExtractionMethod.includes('gpt4o_grid_vision')) &&
    topologyResult.ok &&
    topologyResult.cardTopology &&
    hasAuthoritativeLoyaltyTopology(topologyResult.cardTopology)
  ) {
    const cardTopology = topologyResult.cardTopology;
    const confidence = Math.max(
      Number(cardTopology.confidence) || 0,
      Number(topologyResult.confidence) || 0,
      0.85,
    );
    const rule =
      topologyResult.rule ??
      inferRuleFromTopology(cardTopology, {
        purchaseItem: cardTopology.purchaseItemHint,
        rewardItem: cardTopology.rewardItemHint,
      });
    const stampThreshold = rule?.purchasesRequired ?? null;

    emitLoyaltyTopologyTelemetry('loyalty_topology_upload_fusion_applied', {
      rows: cardTopology.rows ?? null,
      columns: cardTopology.columns ?? null,
      confidence,
      extractionMethod: topologyExtractionMethod || 'gpt4o_grid_vision',
      reason: 'gpt4o_grid_vision_primary',
    });

    return {
      applied: true,
      cardTopology: { ...cardTopology, confidence },
      rule,
      confidence,
      stampThreshold,
      extractionMethod: topologyExtractionMethod || 'gpt4o_grid_vision',
      visualGridEvidence: buildVisualGridEvidenceFromTopology(cardTopology),
      visualResult: buildVisualFusionInput(input.visualDetection),
      ocrResult: buildOcrFusionInput({
        topologyResult: input.topologyResult,
        ocrText: input.ocrText,
        rules: input.rules,
      }),
      fused: null,
      layoutsDisagree: false,
      reason: 'gpt4o_grid_vision_primary',
    };
  }

  const visualResult = buildVisualFusionInput(input.visualDetection);
  const ocrResult = buildOcrFusionInput({
    topologyResult: input.topologyResult,
    ocrText: input.ocrText,
    rules: input.rules,
  });

  const ocrLayout = ocrResult.detectedLayout;
  const visualLayout = visualResult.layout;
  const layoutsDisagree = Boolean(ocrLayout && visualLayout && ocrLayout !== visualLayout);

  if (isStrongOcrTokenGrid(ocrResult) && layoutsDisagree && ocrResult.cardTopology) {
    const rule =
      inferRuleFromTopology(ocrResult.cardTopology, {
        purchaseItem: ocrResult.purchaseItemHint ?? undefined,
        rewardItem: ocrResult.rewardItemHint ?? undefined,
      }) ?? null;
    const stampThreshold = ocrResult.stampThreshold ?? rule?.purchasesRequired ?? null;
    if (rule && stampThreshold) {
      rule.purchasesRequired = stampThreshold;
    }

    const ocrOverrideMethod = `ocr_token_override_${ocrResult.source}`;
    emitLoyaltyTopologyTelemetry('loyalty_topology_upload_fusion_applied', {
      rows: ocrResult.cardTopology.rows ?? null,
      columns: ocrResult.cardTopology.columns ?? null,
      confidence: ocrResult.confidence,
      extractionMethod: ocrOverrideMethod,
      ocrLayout: ocrLayout ?? null,
      visualLayout: visualLayout ?? null,
      layoutsDisagree: true,
    });

    return {
      applied: true,
      cardTopology: {
        ...ocrResult.cardTopology,
        footerText: ocrResult.footerText ?? ocrResult.cardTopology.footerText,
        confidence: ocrResult.confidence,
      },
      rule,
      confidence: ocrResult.confidence,
      stampThreshold,
      extractionMethod: ocrOverrideMethod,
      visualGridEvidence: buildVisualGridEvidenceFromTopology(ocrResult.cardTopology),
      visualResult,
      ocrResult,
      fused: null,
      layoutsDisagree: true,
      reason: 'ocr_token_grid_override_cv',
    };
  }

  const visualPrimary =
    visualResult.success === true &&
    visualResult.cardTopology &&
    hasAuthoritativeLoyaltyTopology(visualResult.cardTopology) &&
    Number(visualResult.confidence) > 0.55;

  if (!visualPrimary && Number(visualResult.confidence) <= 0.55) {
    return {
      applied: false,
      visualResult,
      ocrResult,
      reason: 'cv_below_threshold',
    };
  }

  let fused;
  try {
    fused = fuseTopologyResults(visualResult, ocrResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      applied: false,
      visualResult,
      ocrResult,
      reason: 'fusion_failed',
      error: message,
    };
  }

  if (Number(fused.confidence) <= 0.55) {
    return {
      applied: false,
      visualResult,
      ocrResult,
      fused,
      reason: 'fused_confidence_low',
    };
  }

  if (!visualPrimary && !layoutsDisagree) {
    return {
      applied: false,
      visualResult,
      ocrResult,
      fused,
      reason: 'layouts_agree_no_override',
    };
  }

  if (visualPrimary && Number(fused.confidence) <= 0.6 && !layoutsDisagree) {
    return {
      applied: false,
      visualResult,
      ocrResult,
      fused,
      reason: 'visual_primary_confidence_low',
    };
  }

  const extractionMethod = visualPrimary
    ? `visual_primary_${visualResult.source}`
    : `fusion_cv_override_${visualResult.source}`;

  emitLoyaltyTopologyTelemetry('loyalty_topology_upload_fusion_applied', {
    rows: fused.topology?.rows ?? null,
    columns: fused.topology?.columns ?? null,
    confidence: fused.confidence,
    extractionMethod,
    ocrLayout: ocrLayout ?? null,
    visualLayout: visualLayout ?? null,
    layoutsDisagree,
  });

  return {
    applied: true,
    cardTopology: fused.topology,
    rule: fused.rule,
    confidence: fused.confidence,
    stampThreshold: fused.stampThreshold,
    extractionMethod,
    visualGridEvidence: buildVisualGridEvidenceFromTopology(fused.topology),
    visualResult,
    ocrResult,
    fused,
    layoutsDisagree,
    reason: visualPrimary ? 'visual_primary' : 'cv_override_ocr_layout',
  };
}

export default {
  buildOcrFusionInput,
  buildVisualFusionInput,
  detectVisualGridForUpload,
  fuseUploadTopology,
};
