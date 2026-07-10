/**
 * Soft-handle business-card extract when the image is likely a loyalty stamp card.
 * OCR failure must not kill loyalty missions.
 */

import {
  buildAttachmentAnalysis,
  detectLoyaltyCardVisualHints,
} from './attachmentAnalysis.js';

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

  // Stamp cards often have no business-card-shaped OCR — treat as soft loyalty.
  const looksLikeLoyalty =
    hints.includes('reward_program_candidate') ||
    hints.includes('stamp_grid') ||
    hints.includes('ocr_stamp_language') ||
    !text;

  if (!looksLikeLoyalty && text) {
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
