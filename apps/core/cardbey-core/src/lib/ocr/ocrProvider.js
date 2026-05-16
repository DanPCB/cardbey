/**
 * Unified OCR interface (primary: OpenAI Vision).
 * Used by the fallback pipeline; store-creation OCR is unchanged (performMenuOcr).
 *
 * @typedef {{ text: string, provider: string, confidence?: number }} OcrResult
 * @typedef {{ imageDataUrl?: string, imageBuffer?: Buffer, mimeType?: string, context?: { purpose?: string } }} OcrInput
 */

import { runOcr } from '../../modules/vision/runOcr.js';

const PROVIDER_OPENAI = 'openai_vision';

/**
 * Normalize raw OCR text (line endings, trim, join).
 * @param {string} raw
 * @returns {string}
 */
function normalizeOcrOutput(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Unified OCR extraction (OpenAI Vision primary).
 * Does not use fallback; see ocrFallback.js for primary + fallback.
 *
 * @param {OcrInput} input - imageDataUrl (preferred) or imageBuffer + mimeType, optional context.purpose
 * @returns {Promise<OcrResult>} { text, provider, confidence? }
 */
export async function ocrExtractText(input) {
  const { imageDataUrl, imageBuffer, mimeType, context } = input || {};
  let imageUrl = imageDataUrl;

  if (!imageUrl && imageBuffer && Buffer.isBuffer(imageBuffer)) {
    const mime = mimeType || 'image/jpeg';
    const base64 = imageBuffer.toString('base64');
    imageUrl = `data:${mime};base64,${base64}`;
  }

  if (!imageUrl || typeof imageUrl !== 'string') {
    return { text: '', provider: PROVIDER_OPENAI };
  }

  const purpose = context?.purpose || 'business_card';
  const task =
    purpose === 'business_card'
      ? 'business_card'
      : purpose === 'promo' || purpose === 'intake_attachment'
        ? 'intake_promo'
        : 'menu';

  const raw = await runOcr(imageUrl, { task });
  const text = normalizeOcrOutput(raw);

  return {
    text,
    provider: PROVIDER_OPENAI,
    confidence: text.length > 0 ? 0.9 : undefined,
  };
}
