/**
 * Menu Engine Vision Helper
 * Example usage of Universal Vision Input for menu extraction
 */

import { analyseVisionInput } from '../../modules/vision/universalVisionInput.js';

/**
 * Extract menu using Universal Vision Input
 * This is an alternative to the direct OCR + LLM approach
 * 
 * @param {Object} input - Menu extraction input
 * @param {string} input.tenantId - Tenant ID
 * @param {string} input.storeId - Store ID
 * @param {string} input.imageUrl - Menu image URL
 * @param {string[]} input.detectedItems - Optional detected item labels from UI
 * @param {string} input.locale - Locale (default: 'en')
 * @returns {Promise<Object>} Vision analysis result with menu hints
 */
export async function extractMenuWithVision(input) {
  const { tenantId, storeId, imageUrl, detectedItems, locale } = input;

  console.log('[Menu Engine] Using Universal Vision Input', {
    tenantId,
    storeId,
    imageUrl: imageUrl ? 'provided' : 'missing',
  });

  // Call Universal Vision Input
  const visionResult = await analyseVisionInput({
    tenantId,
    storeId,
    imageUrl,
    purpose: 'menu',
    locale: locale || 'en',
    uiHints: {
      labels: detectedItems || [],
    },
  });

  // Extract menu-specific hints
  const menuHints = visionResult.menuHints;
  const blocks = visionResult.blocks;

  console.log('[Menu Engine] Vision analysis complete', {
    blockCount: blocks.length,
    itemCount: menuHints?.items?.length ?? 0,
    sectionCount: menuHints?.sections?.length ?? 0,
  });

  // Return structured result that can be used by menu.configure
  return {
    ok: true,
    data: {
      visionResult,
      // Convert menu hints to items format for menu.configure
      items: (menuHints?.items || []).map((item, index) => ({
        name: item.label,
        category: null, // Will be guessed by LLM parser
        price: null, // Will be extracted by LLM parser
        currency: 'AUD',
        description: null,
        orderIndex: index,
      })),
      sections: menuHints?.sections || [],
      ocrText: visionResult.raw?.ocrText || '',
    },
  };
}


