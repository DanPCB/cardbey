/**
 * Soft-handle business-card extract when the image is likely a loyalty stamp card.
 * OCR failure must not kill loyalty missions.
 */

import {
  buildAttachmentAnalysis,
  detectLoyaltyCardVisualHints,
  inferLoyaltyStampGridFromOcr,
  listMissingLoyaltyDraftFields,
} from './attachmentAnalysis.js';
import { enrichLoyaltyDraftWithMatrixTopology } from '../loyalty/loyaltyMatrixTopology.js';
import { alignLegacyFieldsWithCanonicalRule } from '../loyalty/loyaltyContractDiagnostics.js';

/**
 * @param {{
 *   extractedText?: string | null;
 *   cardImageDataUrl?: string | null;
 *   filename?: string | null;
 * }} input
 */
export async function softLoyaltyExtractCardFallback(input = {}) {
  const text = String(input.extractedText ?? '').trim();
  const hints = detectLoyaltyCardVisualHints({
    ocrText: text,
    filename: input.filename,
    userMessage: '',
  });

  // Soft loyalty only with loyalty evidence — empty OCR alone is NOT loyalty.
  const looksLikeLoyalty =
    hints.includes('reward_program_candidate') ||
    hints.includes('stamp_grid') ||
    hints.includes('ocr_stamp_language');

  if (!looksLikeLoyalty) {
    return null;
  }

  const analysis = await buildAttachmentAnalysis({
    filename: input.filename ?? 'loyalty-stamp-card.jpg',
    mimeType: 'image/jpeg',
    imageDataUrl: input.cardImageDataUrl ?? null,
    ocrText: text || null,
    ocrFailed: !text,
    runVisionEnrichment: false,
    userMessage: 'loyalty stamp card',
  });

  // Force loyalty type when extract-card OCR gate would have failed.
  if (analysis.artifactType !== 'loyalty_card') {
    analysis.artifactType = 'loyalty_card';
    if (!analysis.visualHints.includes('reward_program_candidate')) {
      analysis.visualHints.push('reward_program_candidate');
    }
    analysis.ocrStatus = text ? 'weak' : 'failed';
    analysis.ocrWarning =
      analysis.ocrWarning ||
      'OCR did not return usable business card text; continuing as loyalty stamp card.';
  }

  if (text) {
    const gridInference = inferLoyaltyStampGridFromOcr(text);
    if (gridInference && analysis.preseededDraft && typeof analysis.preseededDraft === 'object') {
      const stamps = Number(analysis.preseededDraft.requiredStamps);
      const reward = String(analysis.preseededDraft.reward ?? '').trim();
      analysis.preseededDraft = {
        ...analysis.preseededDraft,
        requiredStamps:
          Number.isFinite(stamps) && stamps >= 1
            ? stamps
            : Number(gridInference.requiredStamps) >= 1
              ? Number(gridInference.requiredStamps)
              : null,
        reward: reward || String(gridInference.reward ?? '').trim() || null,
        confidence: Math.max(
          Number(analysis.preseededDraft.confidence) || 0,
          Number(gridInference.confidence) || 0,
        ),
        inferredFrom: gridInference.inferredFrom ?? null,
      };
      const missing = [];
      if (!Number.isFinite(Number(analysis.preseededDraft.requiredStamps)) || Number(analysis.preseededDraft.requiredStamps) < 1) {
        missing.push('requiredStamps');
      }
      if (!String(analysis.preseededDraft.reward ?? '').trim()) missing.push('reward');
      analysis.missingFields = missing;
      if (
        missing.length === 0 &&
        Number(analysis.confidence) < Number(gridInference.confidence)
      ) {
        analysis.confidence = Number(gridInference.confidence);
      }
    }
    if (analysis.preseededDraft && typeof analysis.preseededDraft === 'object') {
      analysis.preseededDraft = alignLegacyFieldsWithCanonicalRule(analysis.preseededDraft);
      analysis.missingFields = listMissingLoyaltyDraftFields(analysis.preseededDraft);
    }
  }

  return {
    ok: true,
    soft: true,
    pathId: 'loyalty_extract_card_soft',
    warning: 'OCR_WEAK',
    message:
      'I can see this looks like a loyalty stamp card, but I could not read enough text from it.',
    attachmentAnalysis: analysis,
    documentType: 'loyalty_card',
    preseededDraft: analysis.preseededDraft,
    extractedText: text || null,
    // Keep shape partially compatible with create-store callers without inventing a business.
    businessName: null,
    confidence: analysis.confidence,
  };
}
