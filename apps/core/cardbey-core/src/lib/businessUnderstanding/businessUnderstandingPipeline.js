/**
 * Business Understanding Engine — orchestrates the vision → contracts pipeline.
 *
 * Camera → Vision → Artifact Classification → Layout → Intent → Rules → Brand → Contracts
 *
 * Renderers must consume canonical contracts, never raw OCR.
 */

import { classifyArtifact } from './artifactClassifier.js';
import { extractLayoutContract } from './layoutRecognition.js';
import { recognizeArtifactIntent } from './intentRecognition.js';
import { extractBusinessRuleContract } from './businessRuleExtraction.js';
import { extractBrandProfile, enrichBrandProfileFromVision } from './brandSignalExtraction.js';
import { buildCanonicalContracts, summarizeCanonicalContracts } from './canonicalContracts.js';
import { resolveDefaultAdaptationMode } from './compositionModes.js';
import { buildMerchantUnderstandingSummary } from './merchantUnderstandingSummary.js';
import { persistUnderstandingToSuitcase } from './suitcaseContractBridge.js';
import { interpretBueArtifactDocument } from './bueDocumentInterpretation.js';
import { composeFromUnderstandingBundle } from './businessCompositionEngine.js';
import { Features } from '../../config/features.js';

/**
 * @param {{
 *   imageUrl?: string | null;
 *   imageDataUrl?: string | null;
 *   filename?: string | null;
 *   mimeType?: string | null;
 *   ocrText?: string | null;
 *   userMessage?: string | null;
 *   storeName?: string | null;
 *   storeId?: string | null;
 *   missionId?: string | null;
 *   evidenceId?: string | null;
 *   ownerId?: string | null;
 *   visualHints?: string[];
 *   priorArtifactType?: string | null;
 *   preseededDraft?: Record<string, unknown> | null;
 *   cardTopology?: Record<string, unknown> | null;
 *   rule?: Record<string, unknown> | null;
 *   brandColors?: string[];
 *   persistToSuitcase?: boolean;
 *   enrichBrandFromVision?: boolean;
 *   digitizeExisting?: boolean;
 *   documentExtraction?: Record<string, unknown> | null;
 * }} input
 */
export async function runBusinessUnderstandingPipeline(input = {}) {
  if (!Features.businessUnderstanding.enabled) {
    return { ok: false, reason: 'BUE_DISABLED' };
  }

  const classification = classifyArtifact({
    filename: input.filename,
    mimeType: input.mimeType,
    ocrText: input.ocrText,
    userMessage: input.userMessage,
    visualHints: input.visualHints,
    priorArtifactType: input.priorArtifactType,
  });

  const cardTopology =
    input.cardTopology ??
    input.preseededDraft?.cardTopology ??
    null;

  const layout = extractLayoutContract({ cardTopology });
  const intent = recognizeArtifactIntent({
    artifactType: classification.artifactType,
    classificationConfidence: classification.confidence,
    userMessage: input.userMessage,
  });

  const rule = input.rule ?? input.preseededDraft?.rule ?? null;
  const businessRule = extractBusinessRuleContract({
    artifactType: classification.artifactType,
    rule,
    preseededDraft: input.preseededDraft,
    layout,
  });

  let brand = extractBrandProfile({
    storeName: input.storeName,
    ocrText: input.ocrText,
    userMessage: input.userMessage,
    layout,
    brandColors: input.brandColors,
    preseededDraft: input.preseededDraft,
  });

  const imageUrl = String(input.imageUrl || input.imageDataUrl || '').trim();
  if (
    (input.enrichBrandFromVision === true || Features.businessUnderstanding.brandVision) &&
    imageUrl
  ) {
    const visionBrand = await enrichBrandProfileFromVision({
      imageUrl,
      missionId: input.missionId ?? null,
    });
    if (visionBrand) {
      brand = { ...brand, ...visionBrand };
    }
  }

  const adaptationMode = resolveDefaultAdaptationMode({
    artifactType: classification.artifactType,
    digitizeExisting: input.digitizeExisting === true,
  });

  const bundle = buildCanonicalContracts({
    classification,
    layout,
    businessRule,
    brand,
    intent,
    adaptationMode,
    sourceImageRef: imageUrl || null,
    storeId: input.storeId ?? null,
    missionId: input.missionId ?? null,
    evidenceId: input.evidenceId ?? null,
  });

  const merchantSummary = buildMerchantUnderstandingSummary(bundle);
  const summary = summarizeCanonicalContracts(bundle);

  const documentInterpretation = interpretBueArtifactDocument(bundle, {
    ocrText: input.ocrText,
    documentExtraction: input.documentExtraction ?? null,
  });

  const channelComposition = composeFromUnderstandingBundle(bundle, {
    channel: 'desktop',
  });

  let suitcase = null;
  if (input.persistToSuitcase === true && input.ownerId) {
    suitcase = await persistUnderstandingToSuitcase({
      ownerId: input.ownerId,
      storeId: input.storeId ?? null,
      storeSlug: input.storeName ?? input.storeId ?? null,
      bundle,
    });
  }

  if (Features.businessUnderstanding.telemetryLog) {
    console.info('[BUE]', JSON.stringify({ summary, merchantHeadline: merchantSummary.headline }));
  }

  return {
    ok: true,
    bundle,
    merchantSummary,
    summary,
    documentInterpretation,
    channelComposition,
    suitcase,
  };
}

export default { runBusinessUnderstandingPipeline };
