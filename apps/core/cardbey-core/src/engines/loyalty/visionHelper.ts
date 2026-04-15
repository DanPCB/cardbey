/**
 * Loyalty Engine Vision Helper
 * Example usage of Universal Vision Input for loyalty card extraction
 */

import {
  analyseVisionInput,
  UniversalVisionResult,
} from '../../modules/vision/universalVisionInput.js';

export interface LoyaltyVisionInput {
  tenantId: string;
  storeId: string;
  imageUrl: string;
  locale?: string;
}

export interface LoyaltyVisionResult {
  ok: boolean;
  data: {
    visionResult: UniversalVisionResult;
    cardTitle: string;
    stampsRequired: number;
    stampsCount: number;
    hasQrCode: boolean;
    qrRegion: { x: number; y: number; width: number; height: number } | null;
    ocrText: string;
  };
}

/**
 * Extract loyalty card info using Universal Vision Input
 */
export async function extractLoyaltyCardWithVision(
  input: LoyaltyVisionInput
): Promise<LoyaltyVisionResult> {
  const { tenantId, storeId, imageUrl, locale } = input;

  console.log('[Loyalty Engine] Using Universal Vision Input', {
    tenantId,
    storeId,
    imageUrl: imageUrl ? 'provided' : 'missing',
  });

  // Call Universal Vision Input
  const visionResult = await analyseVisionInput({
    tenantId,
    storeId,
    imageUrl,
    purpose: 'loyalty',
    locale: locale || 'en',
  });

  // Extract loyalty-specific hints
  const loyaltyHints = visionResult.loyaltyHints;
  const blocks = visionResult.blocks;

  console.log('[Loyalty Engine] Vision analysis complete', {
    blockCount: blocks.length,
    punchCount: loyaltyHints?.punchCountApprox ?? 0,
    hasQrCode: loyaltyHints?.hasQrCode ?? false,
    cardTitle: loyaltyHints?.cardTitle,
  });

  // Return structured result that can be used by loyalty.configure
  return {
    ok: true,
    data: {
      visionResult,
      // Extract loyalty card information
      cardTitle: loyaltyHints?.cardTitle || 'Loyalty Card',
      stampsRequired: 10, // Default, can be extracted from OCR
      stampsCount: loyaltyHints?.punchCountApprox || 0,
      hasQrCode: loyaltyHints?.hasQrCode || false,
      qrRegion: loyaltyHints?.qrRegion || null,
      ocrText: visionResult.raw?.ocrText || '',
    },
  };
}


