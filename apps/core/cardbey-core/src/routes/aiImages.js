/**
 * AI Image Generation Routes
 * 
 * Background image generation via OpenAI DALL·E 3 for Contents Studio / AI Design Assistant
 * 
 * Helpers used:
 * - OpenAI client: src/services/aiService.js (openai instance)
 * - Image download/save: src/services/aiService.js (downloadAndSaveImage)
 * - Static assets: public/assets (served at /assets)
 * 
 * Route mounted at: /api/ai/images (see src/server.js)
 */

import { Router } from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Lazy load sharp to avoid startup crashes if platform binaries aren't available
let sharp = null;

async function getSharp() {
  if (sharp) return sharp;
  
  try {
    const sharpModule = await import('sharp');
    sharp = sharpModule.default;
    return sharp;
  } catch (error) {
    console.warn('[aiImages] Failed to load sharp:', error.message);
    console.warn('[aiImages] Image metadata extraction will be disabled');
    return null;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Initialize OpenAI client (reuse pattern from aiService.js)
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000,
      maxRetries: 2,
    })
  : null;

const HAS_AI = Boolean(openai);

// Constants
const AI_TIMEOUT_MS = 30000; // 30 seconds timeout
const IMAGE_DOWNLOAD_TIMEOUT_MS = 60000; // 60 seconds for image downloads

// Request schema
const GenerateBackgroundRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(1000),
  stylePreset: z.string().optional(),
  goal: z.enum(['poster', 'banner', 'story', 'square']).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

/**
 * Get default dimensions based on goal
 */
function getDefaultDimensions(goal) {
  switch (goal) {
    case 'poster':
      return { width: 1024, height: 1536 }; // or 1792, but 1536 is closer to standard poster
    case 'banner':
      return { width: 1792, height: 1024 };
    case 'story':
      return { width: 1024, height: 1792 }; // Instagram story format
    case 'square':
    default:
      return { width: 1024, height: 1024 };
  }
}

/**
 * Clamp dimensions to OpenAI DALL·E 3 supported sizes
 */
function clampToSupportedSize(width, height) {
  // DALL·E 3 supports: "1024x1024", "1024x1792", "1792x1024"
  const supportedSizes = [
    { w: 1024, h: 1024 },
    { w: 1024, h: 1792 },
    { w: 1792, h: 1024 },
  ];

  // Find closest supported size
  let closest = supportedSizes[0];
  let minDiff = Infinity;

  for (const size of supportedSizes) {
    const diff = Math.abs(size.w - width) + Math.abs(size.h - height);
    if (diff < minDiff) {
      minDiff = diff;
      closest = size;
    }
  }

  return { width: closest.w, height: closest.h };
}

/**
 * Build image prompt from user input
 */
function buildImagePrompt(prompt, stylePreset, goal) {
  const styleSnippet = stylePreset ? `Style: ${stylePreset}.` : '';
  const goalSnippet = goal 
    ? `${goal} composition, leave space for headline text.` 
    : 'poster composition, leave space for headline text.';
  
  const imagePrompt = `
High-quality ${goal ?? 'poster'} design.
${goalSnippet}
Subject: ${prompt}
${styleSnippet}
Ultra clear, commercial, no text baked into the image.
`.trim();

  return imagePrompt;
}

/**
 * Mirror image from remote URL to local assets folder
 * Returns the public URL path (absolute if ASSETS_BASE_URL is set, otherwise relative)
 */
async function mirrorImageToAssets(remoteUrl, opts = {}) {
  const { folder = 'ai-backgrounds' } = opts;

  try {
    // Create timeout promise for download
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Image download timeout')), IMAGE_DOWNLOAD_TIMEOUT_MS);
    });

    // Download image
    const downloadPromise = fetch(remoteUrl);
    const response = await Promise.race([downloadPromise, timeoutPromise]);

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    // Get image buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Ensure assets directory exists
    const assetsDir = path.join(process.cwd(), 'public', 'assets', folder);
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    // Generate filename
    const timestamp = Date.now();
    const filename = `bg-${timestamp}.png`;
    const filePath = path.join(assetsDir, filename);
    const relativeUrl = `/assets/${folder}/${filename}`;

    // Save file
    await fs.promises.writeFile(filePath, buffer);

    // Get image metadata
    const sharpInstance = await getSharp();
    const metadata = sharpInstance ? await sharpInstance(buffer).metadata() : { width: null, height: null };

    // Construct final URL (use ASSETS_BASE_URL if set, otherwise relative)
    const assetsBaseUrl = process.env.ASSETS_BASE_URL;
    const finalUrl = assetsBaseUrl 
      ? `${assetsBaseUrl.replace(/\/$/, '')}/${folder}/${filename}`
      : relativeUrl;

    return {
      url: finalUrl,
      width: metadata.width,
      height: metadata.height,
      sizeBytes: buffer.length,
    };
  } catch (error) {
    console.error('[AI Images] Error mirroring image to assets:', error);
    // If mirroring fails, return the original remote URL
    return { url: remoteUrl, width: null, height: null, sizeBytes: null };
  }
}

/**
 * Get placeholder image URL
 * Returns absolute URL if ASSETS_BASE_URL is set, otherwise relative
 */
function getPlaceholderUrl() {
  // Check for custom placeholder URL
  if (process.env.AI_BG_PLACEHOLDER_URL) {
    return process.env.AI_BG_PLACEHOLDER_URL;
  }

  const assetsBaseUrl = process.env.ASSETS_BASE_URL;

  // Check if we have a placeholder in assets
  const placeholderPath = path.join(process.cwd(), 'public', 'assets', 'placeholders', 'poster-placeholder.webp');
  if (fs.existsSync(placeholderPath)) {
    const relativeUrl = '/assets/placeholders/poster-placeholder.webp';
    return assetsBaseUrl 
      ? `${assetsBaseUrl.replace(/\/$/, '')}/placeholders/poster-placeholder.webp`
      : relativeUrl;
  }

  // Fallback to existing background asset
  const fallbackPath = path.join(process.cwd(), 'public', 'assets', 'library', 'elements', 'backgrounds', 'bg-gradient-soft-01.jpg');
  if (fs.existsSync(fallbackPath)) {
    const relativeUrl = '/assets/library/elements/backgrounds/bg-gradient-soft-01.jpg';
    return assetsBaseUrl
      ? `${assetsBaseUrl.replace(/\/$/, '')}/library/elements/backgrounds/bg-gradient-soft-01.jpg`
      : relativeUrl;
  }

  // Last resort: return null (will trigger error)
  return null;
}

/**
 * POST /api/ai/images/background
 * Generate background image using DALL·E 3
 */
router.post('/background', async (req, res) => {
  try {
    // Validate request
    const parsed = GenerateBackgroundRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'validation_failed',
        details: parsed.error.flatten(),
      });
    }

    const { prompt, stylePreset, goal, width: requestedWidth, height: requestedHeight } = parsed.data;

    // Determine target dimensions
    let targetWidth, targetHeight;
    if (requestedWidth && requestedHeight) {
      const clamped = clampToSupportedSize(requestedWidth, requestedHeight);
      targetWidth = clamped.width;
      targetHeight = clamped.height;
    } else {
      const defaults = getDefaultDimensions(goal || 'poster');
      targetWidth = defaults.width;
      targetHeight = defaults.height;
    }

    // Build size string for OpenAI
    const sizeString = `${targetWidth}x${targetHeight}`;
    if (!['1024x1024', '1024x1792', '1792x1024'].includes(sizeString)) {
      // This shouldn't happen due to clamping, but just in case
      return res.status(400).json({
        ok: false,
        error: 'Unsupported image size. Supported sizes: 1024x1024, 1024x1792, 1792x1024',
      });
    }

    // Build image prompt
    const imagePrompt = buildImagePrompt(prompt, stylePreset, goal);

    let imageUrl = null;
    let finalUrl = null;
    let placeholder = false;
    let source = 'openai';

    // Try to generate image with OpenAI
    if (HAS_AI) {
      try {
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), AI_TIMEOUT_MS);
        });

        // Generate image
        const apiCall = openai.images.generate({
          model: 'dall-e-3',
          prompt: imagePrompt,
          size: sizeString,
          quality: 'hd', // High quality as requested
          n: 1,
        });

        const result = await Promise.race([apiCall, timeoutPromise]);
        imageUrl = result.data?.[0]?.url;

        if (imageUrl) {
          // Mirror image to assets folder
          const mirrored = await mirrorImageToAssets(imageUrl, { folder: 'ai-backgrounds' });
          finalUrl = mirrored.url;
          
          // Update dimensions if we got them from the mirrored image
          if (mirrored.width && mirrored.height) {
            targetWidth = mirrored.width;
            targetHeight = mirrored.height;
          }

          console.log(`[AI Images] Generated background: ${finalUrl}`);
        }
      } catch (error) {
        console.error('[AI Images] OpenAI generation error:', error);
        // Fall through to placeholder
      }
    }

    // Fallback to placeholder if generation failed
    if (!finalUrl) {
      placeholder = true;
      source = 'placeholder';
      const placeholderUrl = getPlaceholderUrl();

      if (!placeholderUrl) {
        return res.status(500).json({
          ok: false,
          error: 'Image generation failed and no placeholder configured',
        });
      }

      finalUrl = placeholderUrl;
      console.log(`[AI Images] Using placeholder: ${finalUrl}`);
    }

    // Build response
    const response = {
      ok: true,
      imageUrl: finalUrl,
      placeholder,
      width: targetWidth,
      height: targetHeight,
      source,
      debugPrompt: imagePrompt,
    };

    // Add error field only if we're using placeholder due to failure
    if (placeholder && HAS_AI) {
      response.error = 'Image generation failed, using placeholder';
    }

    res.json(response);
  } catch (error) {
    console.error('[AI Images] Unexpected error:', error);

    // Try placeholder fallback
    try {
      const placeholderUrl = getPlaceholderUrl();
      if (placeholderUrl) {
        const defaults = getDefaultDimensions(req.body?.goal || 'poster');
        return res.status(200).json({
          ok: true,
          imageUrl: placeholderUrl,
          placeholder: true,
          width: defaults.width,
          height: defaults.height,
          source: 'placeholder',
          error: 'Image generation failed, using placeholder',
        });
      }
    } catch (placeholderError) {
      console.error('[AI Images] Placeholder fallback also failed:', placeholderError);
    }

    // Hard failure
    res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
});

/**
 * Example request:
 * POST /api/ai/images/background
 * {
 *   "prompt": "Vietnamese noodle bowl poster with bold headline and price tag",
 *   "stylePreset": "Bold & Vibrant",
 *   "goal": "poster"
 * }
 *
 * Response:
 * {
 *   "ok": true,
 *   "imageUrl": "https://.../assets/ai-backgrounds/bg-1234567890.png",
 *   "placeholder": false,
 *   "width": 1024,
 *   "height": 1536,
 *   "source": "openai",
 *   "debugPrompt": "High-quality poster design..."
 * }
 */

export default router;

