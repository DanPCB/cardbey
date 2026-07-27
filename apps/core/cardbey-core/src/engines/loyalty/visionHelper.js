/**
 * Loyalty Engine Vision Helper
 * Example usage of Universal Vision Input for loyalty card extraction
 */

import { analyseVisionInput } from '../../modules/vision/universalVisionInput.js';

/**
 * Extract loyalty card info using Universal Vision Input
 * 
 * @param {Object} input - Loyalty card extraction input
 * @param {string} input.tenantId - Tenant ID
 * @param {string} input.storeId - Store ID
 * @param {string} input.imageUrl - Loyalty card image URL
 * @param {string} input.locale - Locale (default: 'en')
 * @returns {Promise<Object>} Vision analysis result with loyalty hints
 */
export async function extractLoyaltyCardWithVision(input) {
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


