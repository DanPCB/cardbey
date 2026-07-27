/**
 * Vision-only loyalty card extraction — no LoyaltyProgram writes.
 */

import { getVisionEngine, getTextEngine } from '../../../ai/engines/index.js';
import { extractLoyaltyCardTopology } from '../../loyalty/loyaltyTopologyExtraction.js';
import { purchasesRequiredFromRule } from '../../loyalty/loyaltyRuleInference.js';
import { emitTopologyFallbackUsed } from '../../loyalty/loyaltyTopologyTelemetry.js';
import {
  alignLegacyFieldsWithCanonicalRule,
  logLoyaltyContractDiagnostic,
} from '../../loyalty/loyaltyContractDiagnostics.js';
import { safeParseRulesJson, sanitizeLlmRewardText } from '../../loyalty/loyaltyTopologyJsonParse.js';
import { summarizeMissionEvidenceGraph } from '../../mission/missionEvidenceGraph.js';
import { buildLoyaltyMissionEvidenceGraph } from '../../mission/loyaltyMissionEvidence.js';
import {
  detectVisualGridForUpload,
  fuseUploadTopology,
} from '../../loyalty/loyaltyUploadTopologyFusion.js';
import {
  extractLoyaltyCardGridFromVision,
  isStrongGptGridVisionResult,
  EXTRACTION_METHOD_GPT_GRID_VISION,
} from '../../loyalty/loyaltyCardGridVisionExtract.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {{ imageUrl: string, storeName?: string | null, storeId?: string | null, missionId?: string | null, existingCardTopology?: import('../../loyalty/loyaltyTopologyTypes.js').LoyaltyCardTopology | null }} input
 */
export async function extractLoyaltyCardFromImage(input) {
  const imageUrl = pickString(input?.imageUrl);
  if (!imageUrl) {
    return {
      ok: false,
      error: { code: 'IMAGE_REQUIRED', message: 'imageUrl is required for loyalty card extraction' },
    };
  }

  const vision = getVisionEngine();
  const [gridVisionResult, legacyVisionResult] = await Promise.all([
    extractLoyaltyCardGridFromVision({
      imageUrl,
      storeId: input?.storeId ?? null,
      missionId: input?.missionId ?? null,
    }),
    vision.analyzeImage({ imageUrl, task: 'loyalty_card' }).catch(() => ({ text: '' })),
  ]);

  const ocrText = pickString(
    gridVisionResult?.ocrText,
    legacyVisionResult?.text,
  );

  const text = getTextEngine();
  const rulesPrompt = `You are analyzing a loyalty card. Extract business rule fields from this OCR text:

${ocrText || '(no text detected)'}

Return JSON only:
- stampsRequired: number (purchases required PER reward cycle/row — NOT total stamps on card, NOT column count)
- rewardDescription: string
- programName: string (optional)
- purchaseItem: string (optional, e.g. Coffee)
- rewardItem: string (optional, e.g. Free Coffee)
- expiryPolicy: string (optional)
- terms: string (optional)
- confidence: number 0-1

If the card has repeated rows like "7 Coffee + 1 Free" per row, stampsRequired must be 7, not 8.`;

  const [topologyResult, visualDetection, rulesResult] = await Promise.all([
    gridVisionResult?.ok && isStrongGptGridVisionResult(gridVisionResult)
      ? Promise.resolve({
          ok: true,
          cardTopology: gridVisionResult.cardTopology,
          rule: gridVisionResult.rule,
          detected: gridVisionResult.detected,
          extractionMethod: gridVisionResult.extractionMethod ?? EXTRACTION_METHOD_GPT_GRID_VISION,
          skippedLlm: true,
          visionGrid: true,
        })
      : extractLoyaltyCardTopology({
          ocrText,
          storeName: input?.storeName,
          storeId: input?.storeId,
          missionId: input?.missionId,
          skipRescanIfOwnerDefined: input?.existingCardTopology ?? null,
        }),
    detectVisualGridForUpload(imageUrl, {
      ocrText,
      missionId: input?.missionId ?? null,
      storeId: input?.storeId ?? null,
    }),
    text.generateText({
      systemPrompt: 'You are a loyalty program analyzer. Return valid JSON only.',
      userPrompt: rulesPrompt,
      temperature: 0.2,
    }),
  ]);

  let rules;
  try {
    rules = safeParseRulesJson(rulesResult.text, { logLabel: 'loyalty_card_vision_rules' });
    if (!rules) {
      rules = {
        stampsRequired: null,
        rewardDescription: null,
        confidence: ocrText ? 0.45 : 0.2,
      };
    }
  } catch {
    rules = {
      stampsRequired: null,
      rewardDescription: null,
      confidence: ocrText ? 0.45 : 0.2,
    };
  }

  const fusion = fuseUploadTopology({
    visualDetection,
    topologyResult,
    ocrText,
    rules,
    preferVisionGrid: Boolean(gridVisionResult?.ok && isStrongGptGridVisionResult(gridVisionResult)),
  });

  let topologyRule = topologyResult.ok ? topologyResult.rule : null;
  let cardTopology = topologyResult.ok ? topologyResult.cardTopology : null;
  let extractionMethod = topologyResult.extractionMethod ?? null;
  let visualGridEvidence = null;

  if (fusion.applied && fusion.cardTopology) {
    cardTopology = fusion.cardTopology;
    topologyRule = fusion.rule ?? topologyRule;
    extractionMethod = fusion.extractionMethod ?? extractionMethod;
    visualGridEvidence = fusion.visualGridEvidence ?? null;
    if (fusion.stampThreshold && topologyRule) {
      topologyRule = { ...topologyRule, purchasesRequired: fusion.stampThreshold };
    }
  }

  const rulePurchases = purchasesRequiredFromRule(topologyRule);

  let stampsRequired =
    rulePurchases ?? (Math.max(1, Number(rules.stampsRequired) || 0) || null);
  if (topologyRule && stampsRequired !== rulePurchases) {
    stampsRequired = rulePurchases;
  }

  const purchaseItem = pickString(topologyRule?.purchaseItem, rules.purchaseItem, 'Coffee');
  const rewardItem = pickString(
    topologyRule?.rewardItem,
    sanitizeLlmRewardText(rules.rewardItem),
    sanitizeLlmRewardText(rules.rewardDescription),
    sanitizeLlmRewardText(rules.reward),
  );
  const reward = pickString(rewardItem, sanitizeLlmRewardText(rules.rewardDescription), 'Free coffee');
  const storeName = pickString(input?.storeName);
  const programName =
    pickString(rules.programName) || (storeName ? `${storeName} Rewards` : 'Loyalty Rewards');
  const confidence = Math.min(
    1,
    Math.max(
      0,
      Number(fusion.applied ? fusion.confidence : null) ||
        Number(cardTopology?.confidence) ||
        Number(rules.confidence) ||
        (reward && stampsRequired ? 0.85 : 0.4),
    ),
  );

  if (!cardTopology) {
    emitTopologyFallbackUsed('NO_TOPOLOGY', {
      storeId: input?.storeId ?? null,
      missionId: input?.missionId ?? null,
    });
  } else if (cardTopology.reviewRequired) {
    emitTopologyFallbackUsed('LOW_CONFIDENCE', {
      storeId: input?.storeId ?? null,
      confidence: cardTopology.confidence,
    });
  }

  const rule =
    topologyRule ??
    (stampsRequired && reward
      ? {
          programType: 'STAMP_CARD',
          purchaseItem,
          purchasesRequired: stampsRequired,
          rewardQuantity: 1,
          rewardItem: reward,
          repeatMode: 'INDEFINITE',
        }
      : null);

  const preseededDraft = alignLegacyFieldsWithCanonicalRule({
    programName,
    requiredStamps: stampsRequired,
    stampThreshold: stampsRequired,
    reward: reward || null,
    rewardRule:
      stampsRequired && reward
        ? `Collect ${stampsRequired} ${purchaseItem} stamps, receive ${reward}`
        : null,
    terms: pickString(rules.terms, rules.notes) || null,
    expiry: pickString(rules.expiryPolicy) || null,
    confidence,
    extractedFromImage: true,
    imageAssetId: imageUrl,
    programType: 'stamp_card',
    rule,
    cardTopology,
    cardFooterText: cardTopology?.footerText ?? null,
    layoutSource: cardTopology?.source ?? null,
    layoutConfidence: cardTopology?.confidence ?? null,
    topologyReviewRequired: Boolean(cardTopology?.reviewRequired),
    visualGridEvidence,
    ocrText,
    topologyExtractionMethod: extractionMethod,
  });

  logLoyaltyContractDiagnostic('extractLoyaltyCardFromImage', preseededDraft, {
    missionId: input?.missionId ?? null,
    storeId: input?.storeId ?? null,
  });

  const missionEvidenceGraph = buildLoyaltyMissionEvidenceGraph({
    missionId: input?.missionId ?? null,
    evidenceId: pickString(input?.evidenceId),
    ocrText,
    preseededDraft,
    extractionMethod,
    topologyResult: fusion.applied
      ? { ...topologyResult, cardTopology, rule: topologyRule, extractionMethod }
      : topologyResult,
  });

  if (process.env.NODE_ENV !== 'production') {
    console.info('[LoyaltyEvidenceGraph]', summarizeMissionEvidenceGraph(missionEvidenceGraph));
  }

  return {
    ok: true,
    preseededDraft,
    rule,
    cardTopology,
    ocrText,
    missionEvidenceGraph,
    visionRaw: gridVisionResult?.visionRaw ?? legacyVisionResult?.raw ?? null,
    gridVision: gridVisionResult?.ok
      ? {
          rows: gridVisionResult.cardTopology?.rows ?? null,
          columns: gridVisionResult.cardTopology?.columns ?? null,
          confidence: gridVisionResult.confidence ?? null,
          method: gridVisionResult.extractionMethod ?? null,
        }
      : null,
    rulesRaw: rulesResult?.raw ?? null,
    topologyRaw: topologyResult.detected ?? null,
    visualDetection,
    topologyFusion: fusion.applied
      ? {
          applied: true,
          reason: fusion.reason,
          extractionMethod,
          ocrLayout: fusion.ocrResult?.detectedLayout ?? null,
          visualLayout: fusion.visualResult?.layout ?? null,
        }
      : { applied: false, reason: fusion.reason ?? null },
  };
}
