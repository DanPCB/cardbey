/**
 * Extract Loyalty Card Helper
 * Example usage of Universal Vision Input for loyalty card extraction
 * 
 * This function can be called when scanning a loyalty card photo
 * to extract card information using vision analysis
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
export async function extractLoyaltyCard(input) {
  const { tenantId, storeId, imageUrl, locale } = input;

  console.log('[Loyalty Engine] Using Universal Vision Input for card extraction', {
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

  const hints = visionResult.loyaltyHints;

  console.log('[Loyalty Engine] Vision hints', hints);

  // You can now prefill a new loyalty template:
  // - number of punches
  // - whether QR exists
  // - guessed card title

  return {
    ok: true,
    data: {
      visionResult,
      // Extract loyalty card information
      cardTitle: hints?.cardTitle || 'Loyalty Card',
      stampsRequired: 10, // Default, can be extracted from OCR
      stampsCount: hints?.punchCountApprox || 0,
      hasQrCode: hints?.hasQrCode || false,
      qrRegion: hints?.qrRegion || null,
      ocrText: visionResult.raw?.ocrText || '',
    },
  };
}


