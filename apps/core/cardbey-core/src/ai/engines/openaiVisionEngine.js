/**
 * OpenAI Vision Engine Adapter
 * Implements VisionEngine interface using OpenAI Vision API
 */

import OpenAI from 'openai';
import fetch from 'node-fetch';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000,
      maxRetries: 2,
    })
  : null;

const HAS_AI = Boolean(openai);

// Debug logging helper (gated by environment variable)
const DEBUG_VISION = process.env.DEBUG_VISION === 'true' || process.env.DEBUG_VISION === '1';

function debugLog(...args) {
  if (DEBUG_VISION) {
    console.log('[OpenAI Vision Engine]', ...args);
  }
}

/**
 * Check if a URL is private/local (not accessible by OpenAI)
 * @param {string} url - URL to check
 * @returns {boolean} true if URL is private/local
 */
function isPrivateUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const protocol = urlObj.protocol.toLowerCase();

    // Check for localhost variants
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return true;
    }

    // Check for private IP ranges
    // 192.168.x.x
    if (hostname.startsWith('192.168.')) {
      return true;
    }
    // 10.x.x.x
    if (hostname.startsWith('10.')) {
      return true;
    }
    // 172.16.x.x - 172.31.x.x
    const parts = hostname.split('.');
    if (parts.length >= 2 && parts[0] === '172') {
      const secondOctet = parseInt(parts[1], 10);
      if (!isNaN(secondOctet) && secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }

    // In dev mode, plain HTTP is likely private
    if (process.env.NODE_ENV !== 'production' && protocol === 'http:') {
      return true;
    }

    return false;
  } catch (error) {
    // If URL parsing fails, assume it might be private
    debugLog('URL parsing failed, assuming private:', url, error.message);
    return true;
  }
}

/**
 * Fetch an image from a URL and convert it to a base64 data URL
 * @param {string} url - Image URL to fetch
 * @returns {Promise<string>} Data URL (data:image/<mime>;base64,<data>)
 */
async function fetchImageAsDataUrl(url) {
  debugLog('Fetching private URL as base64:', url);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Cardbey-Vision-Engine/1.0',
      },
      // Don't send cookies/auth for public uploads endpoint
      // If auth is needed, it should be handled via query params or headers
    });

    if (!response.ok) {
      const statusText = response.statusText || 'Unknown error';
      const contentType = response.headers.get('content-type') || 'unknown';
      let responsePreview = '';
      try {
        const text = await response.text();
        responsePreview = text.substring(0, 200);
      } catch {
        // Ignore text read errors
      }

      throw new Error(
        `Failed to download image: ${response.status} ${statusText}. ` +
        `Content-Type: ${contentType}. ` +
        `Response preview: ${responsePreview}`
      );
    }

    // Determine MIME type from response header or file extension
    let mimeType = response.headers.get('content-type') || '';
    
    // If content-type is missing or generic, try to infer from URL
    if (!mimeType || mimeType === 'application/octet-stream' || !mimeType.startsWith('image/')) {
      const urlLower = url.toLowerCase();
      if (urlLower.endsWith('.jpg') || urlLower.endsWith('.jpeg')) {
        mimeType = 'image/jpeg';
      } else if (urlLower.endsWith('.png')) {
        mimeType = 'image/png';
      } else if (urlLower.endsWith('.webp')) {
        mimeType = 'image/webp';
      } else if (urlLower.endsWith('.gif')) {
        mimeType = 'image/gif';
      } else {
        // Default to jpeg if we can't determine
        mimeType = 'image/jpeg';
        debugLog('Could not determine MIME type, defaulting to image/jpeg');
      }
    }

    // Extract base MIME type (remove charset, etc.)
    const baseMimeType = mimeType.split(';')[0].trim();

    // Convert response to buffer
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    const dataUrl = `data:${baseMimeType};base64,${base64}`;
    debugLog('Successfully converted to data URL, size:', base64.length, 'bytes');
    
    return dataUrl;
  } catch (error) {
    debugLog('Error fetching image:', error.message);
    throw new Error(`Failed to fetch image from ${url}: ${error.message}`);
  }
}

export const openaiVisionEngine = {
  name: 'openai-vision-v1',

  async analyzeImage({ imageUrl, imageBase64, task }) {
    if (!HAS_AI) {
      throw new Error('OpenAI API key not configured');
    }

    if (!imageUrl && !imageBase64) {
      throw new Error('Either imageUrl or imageBase64 must be provided');
    }

    try {
      // Build prompt based on task
      let prompt = 'Extract all text from this image. Return only the raw text, line by line, exactly as it appears.';
      
      if (task === 'loyalty_card') {
        prompt = 'Extract text from this loyalty card image. Focus on stamp count, reward description, and card title. Return the text exactly as it appears.';
      } else if (task === 'menu') {
        prompt = 'Extract all text from this menu image. Return only the raw text, line by line, exactly as it appears. Do not add any formatting or interpretation.';
      } else if (task === 'business_card') {
        prompt = 'Output ONLY the extracted text from this image. Preserve line breaks. No explanations, no disclaimers, no assistant voice. If the image is unreadable or not text, output nothing (empty). Do not write "I cannot" or "I\'m sorry" or any reply—only the raw text visible in the image.';
      } else if (task === 'shopfront') {
        prompt = 'Extract text and describe visual elements from this shopfront image. Return text content and any visible signage or displays.';
      } else if (task === 'intake_promo') {
        // Dense flyers/posters: model must transcribe, not summarize — market_research only sees this string (not the image).
        prompt =
          'Performer intake — flyers, posters, ads, and photos.\n' +
          '(1) Transcribe ALL readable text verbatim: every headline, price, date, place name, bullet, and fine print you can see. ' +
          'Preserve the original language and script (e.g. Vietnamese, Japanese, English); do not translate. ' +
          'Use line breaks between sections.\n' +
          '(2) Only if the image has no readable text at all, briefly describe the main subject (what is shown).\n' +
          '(3) Plain text only — no preamble ("Here is...", "In this image").';
      } else if (task === 'intake_preprocess') {
        // Runs before intake classification; output is parsed for routing + campaignContext.
        prompt =
          'Pre-process this attachment for a marketing assistant.\n\n' +
          'Use EXACTLY these section headers on their own lines (no markdown code fences):\n\n' +
          '---IMAGE_TEXT---\n' +
          'Transcribe ALL readable text verbatim (any language). Every headline, price, date, place name, bullet, fine print. ' +
          'Preserve original script; do not translate. Use line breaks between blocks.\n\n' +
          '---IMAGE_DESCRIPTION---\n' +
          'ONE concise English sentence: what kind of asset this is (e.g. Japan tour flyer, spa price list) and the main offer or subject.\n\n' +
          'If there is no readable text, leave IMAGE_TEXT empty and only fill IMAGE_DESCRIPTION from what you see.';
      }

      // Determine image content URL
      let finalImageUrl;
      let useDataUrl = false;

      if (imageBase64) {
        // Caller already provided base64
        finalImageUrl = `data:image/jpeg;base64,${imageBase64}`;
        useDataUrl = true;
        debugLog('Using provided base64 data');
      } else if (imageUrl) {
        // Check if it's already a data URL
        if (imageUrl.startsWith('data:image/')) {
          finalImageUrl = imageUrl;
          useDataUrl = true;
          debugLog('Using provided data URL');
        } else if (isPrivateUrl(imageUrl)) {
          // Private URL - fetch and convert to base64
          debugLog('Detected private URL, converting to base64:', imageUrl);
          finalImageUrl = await fetchImageAsDataUrl(imageUrl);
          useDataUrl = true;
        } else {
          // Public URL - use directly
          finalImageUrl = imageUrl;
          useDataUrl = false;
          debugLog('Using public URL directly:', imageUrl);
        }
      }

      // Build image content (high detail helps small text on flyers / multi-language posters)
      const highDetailTask = task === 'intake_promo' || task === 'intake_preprocess';
      const imageContent = {
        type: 'image_url',
        image_url: highDetailTask ? { url: finalImageUrl, detail: 'high' } : { url: finalImageUrl },
      };

      debugLog('Sending to OpenAI:', {
        method: useDataUrl ? 'data_url' : 'image_url',
        task,
        urlPreview: useDataUrl ? 'data:image/...' : finalImageUrl.substring(0, 100),
      });

      const response = await openai.chat.completions.create({
        model: 'gpt-4o', // Vision-capable model
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              imageContent,
            ],
          },
        ],
        max_tokens: task === 'intake_preprocess' ? 4096 : 2000,
      });

      const text = response.choices[0]?.message?.content || '';

      debugLog('OpenAI response received, text length:', text.length);

      return {
        text,
        raw: {
          model: 'gpt-4o',
          usage: response.usage,
          responseId: response.id,
        },
      };
    } catch (error) {
      // Improve error messages for common OpenAI download failures
      let errorMessage = error.message || 'Unknown error';
      
      if (errorMessage.includes('400') && (errorMessage.includes('download') || errorMessage.includes('image'))) {
        errorMessage = 'OpenAI cannot download this URL (likely private/local). Use base64 or a public URL.';
      }

      console.error('[OpenAI Vision Engine] Error:', error);
      throw new Error(`Vision analysis failed: ${errorMessage}`);
    }
  },
};


