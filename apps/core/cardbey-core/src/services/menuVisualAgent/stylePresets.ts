/**
 * Style Presets System
 * Defines style presets for image selection/generation
 * Maps business style preferences to image search/generation parameters
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface StylePreset {
  name: string;
  unsplashKeywords: string[];
  openaiPromptSuffix: string;
}

/**
 * Available style presets
 */
export const STYLE_PRESETS: Record<string, StylePreset> = {
  modern: {
    name: 'modern',
    unsplashKeywords: ['modern food photography', 'contemporary', 'clean'],
    openaiPromptSuffix: 'modern, professional food photography, clean lighting, minimalist',
  },
  warm: {
    name: 'warm',
    unsplashKeywords: ['warm food photography', 'cozy', 'inviting'],
    openaiPromptSuffix: 'warm, inviting food photography, cozy atmosphere, natural lighting',
  },
  minimal: {
    name: 'minimal',
    unsplashKeywords: ['minimalist food', 'simple', 'white background'],
    openaiPromptSuffix: 'minimalist food photography, simple composition, white background',
  },
  vibrant: {
    name: 'vibrant',
    unsplashKeywords: ['vibrant food photography', 'colorful', 'high contrast'],
    openaiPromptSuffix: 'vibrant, colorful food photography, high contrast, energetic',
  },
};

/**
 * Get style preset for a business
 * Extracts style from Business.stylePreferences JSON or defaults to 'modern'
 * 
 * @param businessId - Business ID to look up
 * @returns Style preset object
 */
export async function getStylePreset(businessId: string): Promise<StylePreset> {
  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { stylePreferences: true },
    });

    if (business?.stylePreferences) {
      const prefs = business.stylePreferences as any;
      const styleName = prefs.style || prefs.mood || 'modern';
      
      // Validate style name
      if (styleName in STYLE_PRESETS) {
        return STYLE_PRESETS[styleName];
      }
    }
  } catch (error) {
    console.error('[StylePresets] Failed to load business style:', error);
  }

  // Default to modern if no style found
  return STYLE_PRESETS.modern;
}

/**
 * Build image prompt for OpenAI
 * Combines item name, description, and style preset
 * 
 * @param itemName - Menu item name
 * @param description - Optional item description
 * @param style - Style preset
 * @returns Complete prompt string
 */
export function buildImagePrompt(
  itemName: string,
  description: string | null | undefined,
  style: StylePreset
): string {
  const descriptionText = description ? `, ${description}` : '';
  return `A high-quality ${style.openaiPromptSuffix} image of ${itemName}${descriptionText}. The image should be appetizing and suitable for a restaurant menu.`;
}

/**
 * Get style name from preset (for logging/debugging)
 */
export function getStyleName(style: StylePreset): string {
  return style.name;
}

