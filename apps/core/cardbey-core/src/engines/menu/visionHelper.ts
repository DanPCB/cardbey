/**
 * Menu Engine Vision Helper
 * Example usage of Universal Vision Input for menu extraction
 */

import {
  analyseVisionInput,
  UniversalVisionResult,
} from '../../modules/vision/universalVisionInput.js';

export interface MenuVisionInput {
  tenantId: string;
  storeId: string;
  imageUrl: string;
  detectedItems?: string[];
  locale?: string;
}

export interface MenuVisionResult {
  ok: boolean;
  data: {
    visionResult: UniversalVisionResult;
    items: Array<{
      name: string;
      category: string | null;
      price: number | null;
      currency: string;
      description: string | null;
      orderIndex: number;
    }>;
    sections: string[];
    ocrText: string;
  };
}

/**
 * Extract menu using Universal Vision Input
 * This is an alternative to the direct OCR + LLM approach
 */
export async function extractMenuWithVision(
  input: MenuVisionInput
): Promise<MenuVisionResult> {
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


