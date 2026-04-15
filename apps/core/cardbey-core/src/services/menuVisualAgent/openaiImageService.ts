if (process.env.NODE_ENV !== 'production') {
  console.log('[LOAD] openaiImageService.ts ownerTenantFix v3');
}
/**
 * OpenAI Image Generation Service
 * Generates images via OpenAI DALL-E 3 API
 *
 * Legal: Uses OpenAI API only (no training, no storage)
 * Rate limits: Handled by OpenAI (varies by tier)
 */

import OpenAI from 'openai';
import { getShutdownSignal, isShutdownRequested } from '../../lib/coreShutdown.js';

// Initialize OpenAI client (reuse existing if available)
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

export interface OpenAIImageResult {
  url: string;
  prompt: string; // The actual prompt used (for transparency)
}

/** Vertical-based prompt template: food, services, retail, beauty. Default food preserves existing behavior. */
export type VerticalGroupForImage = 'food' | 'services' | 'retail' | 'beauty';

const STYLE_BY_VERTICAL: Record<
  VerticalGroupForImage,
  Record<string, string>
> = {
  food: {
    modern: 'modern, professional food photography, clean lighting',
    warm: 'warm, inviting food photography, cozy atmosphere',
    minimal: 'minimalist food photography, simple composition, white background',
    vibrant: 'vibrant, colorful food photography, high contrast',
  },
  services: {
    modern: 'clean, professional lifestyle photography, neutral lighting, modern service branding',
    warm: 'warm, professional office or consultation setting, soft lighting',
    minimal: 'minimalist professional photography, simple composition, neutral background',
    vibrant: 'professional lifestyle imagery, clear and polished, modern branding',
  },
  retail: {
    modern: 'product photography on clean background, professional lighting',
    warm: 'product photography on warm neutral background, inviting',
    minimal: 'minimalist product photography, white or light gray background',
    vibrant: 'vibrant product photography, clean background, high clarity',
  },
  beauty: {
    modern: 'clean, professional beauty and cosmetics photography, soft even lighting, modern aesthetic',
    warm: 'warm, flattering beauty photography, natural skin tones, inviting',
    minimal: 'minimalist beauty product photography, simple composition, neutral or white background',
    vibrant: 'vibrant beauty and cosmetics imagery, high clarity, polished and on-brand',
  },
};

const SUFFIX_BY_VERTICAL: Record<VerticalGroupForImage, string> = {
  food: 'The image should be appetizing and suitable for a restaurant menu.',
  services: 'The image should look professional and suitable for a service business or consultancy.',
  retail: 'The image should be clear product photography suitable for an online store.',
  beauty: 'The image should be polished beauty or cosmetics imagery suitable for a salon, spa, or beauty brand.',
};

/**
 * Generate an image for a menu item using OpenAI DALL-E 3
 *
 * @param itemName - Menu item name or search query (e.g., "Flat White", "Consultation session")
 * @param description - Optional item description
 * @param style - Optional style preset
 * @param verticalGroup - Optional vertical group for prompt template: food (default), services, retail, beauty
 * @returns Image URL and prompt used, or null if API unavailable
 */
export async function generateMenuItemImage(
  itemName: string,
  description?: string | null,
  style?: 'modern' | 'warm' | 'minimal' | 'vibrant',
  verticalGroup?: VerticalGroupForImage | string | null
): Promise<OpenAIImageResult | null> {
  if (!openai) {
    console.log('[OpenAIImageService] API key not configured, skipping AI generation');
    return null;
  }
  if (isShutdownRequested()) {
    console.warn('[OpenAIImageService] Skipping generation (server is shutting down)');
    return null;
  }

  try {
    const group: VerticalGroupForImage =
      verticalGroup === 'services' || verticalGroup === 'retail' || verticalGroup === 'beauty'
        ? verticalGroup
        : 'food';
    const styleMap = STYLE_BY_VERTICAL[group];
    const styleKey = style && style in styleMap ? style : 'modern';
    const stylePrompt = styleMap[styleKey] || styleMap.modern;
    const suffix = SUFFIX_BY_VERTICAL[group];

    const descriptionText = description ? `, ${description}` : '';
    const prompt = `A high-quality ${stylePrompt} image of ${itemName}${descriptionText}. ${suffix}`;

    console.log('[OpenAIImageService] Generating image with prompt:', prompt);

    // Call DALL-E 3 API (pass shutdown signal so in-flight requests abort on SIGINT)
    const response = await openai.images.generate(
      {
        model: 'dall-e-3',
        prompt,
        size: '1024x1024', // Standard size for product images
        quality: 'standard',
        n: 1, // Generate 1 image
      },
      { signal: getShutdownSignal() },
    );

    if (response.data && response.data.length > 0) {
      const imageUrl = response.data[0].url;
      
      if (!imageUrl) {
        console.error('[OpenAIImageService] No URL in response');
        return null;
      }

      console.log('[OpenAIImageService] Image generated successfully');

      return {
        url: imageUrl,
        prompt: response.data[0].revised_prompt || prompt, // Use revised prompt if available
      };
    }

    console.error('[OpenAIImageService] Empty response from OpenAI');
    return null;
  } catch (error: any) {
    if (error?.name === 'AbortError' || isShutdownRequested()) {
      console.warn('[OpenAIImageService] Generation aborted (server shutting down)');
      return null;
    }
    const msg = (error?.message ?? '').toLowerCase();
    const code = error?.code ?? error?.status;
    const isBillingQuota =
      code === 429 ||
      code === 'insufficient_quota' ||
      code === 'billing_hard_limit_reached' ||
      /billing\s*(hard\s*)?limit|quota\s*exceeded|insufficient\s*quota|exceeded.*quota/.test(msg);
    if (isBillingQuota) {
      const err = new Error(error?.message ?? 'Billing hard limit or quota reached') as Error & { code: string };
      err.code = 'BILLING_HARD_LIMIT';
      console.warn('[OpenAIImageService] Billing/quota limit — stop further image attempts:', error?.message);
      throw err;
    }
    console.error('[OpenAIImageService] Generation failed:', error?.message);
    if (error?.status === 429) {
      console.warn('[OpenAIImageService] Rate limit hit, will retry later');
    }
    return null;
  }
}

/**
 * Check if OpenAI image service is available
 */
export function isOpenAIImageAvailable(): boolean {
  return openai !== null;
}

