/**
 * OCR Service — extract text from card/product images.
 * Uses existing OpenAI Vision pipeline (see lib/ocr/ocrProvider.js).
 */

import { ocrExtractText } from '../../lib/ocr/ocrProvider.js';

const LOW_CONFIDENCE_THRESHOLD = 0.3;

/**
 * @param {string | Buffer} imageData - data URL, base64 string, or buffer
 * @param {{ mimeType?: string }} [options]
 */
export async function extractText(imageData, options = {}) {
  try {
    let imageDataUrl = null;
    let imageBuffer = null;
    let mimeType = options.mimeType || 'image/jpeg';

    if (Buffer.isBuffer(imageData)) {
      imageBuffer = imageData;
    } else if (typeof imageData === 'string') {
      if (imageData.startsWith('data:image/')) {
        imageDataUrl = imageData;
      } else {
        imageDataUrl = `data:${mimeType};base64,${imageData.replace(/^data:[^;]+;base64,/, '')}`;
      }
    }

    if (!imageDataUrl && !imageBuffer) {
      return { text: '', confidence: 0, error: 'Invalid image data' };
    }

    const result = await ocrExtractText({
      imageDataUrl: imageDataUrl ?? undefined,
      imageBuffer: imageBuffer ?? undefined,
      mimeType,
      context: { purpose: 'business_card' },
    });

    const text = String(result?.text ?? '').trim();
    const confidence =
      typeof result?.confidence === 'number'
        ? result.confidence
        : text.length >= 20
          ? 0.85
          : text.length >= 8
            ? 0.55
            : text.length > 0
              ? 0.35
              : 0;

    return {
      text,
      confidence,
      provider: result?.provider ?? 'openai_vision',
      lowConfidence: confidence < LOW_CONFIDENCE_THRESHOLD,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[OCRService] extractText failed:', message);
    return { text: '', confidence: 0, error: message };
  }
}

export default { extractText };
