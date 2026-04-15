/**
 * Business-card OCR entry point for Agent Chat only.
 * Uses same underlying runOcr (OpenAI Vision) with a strict OCR-only prompt.
 * Store creation continues to use performMenuOcr; this module is not used there.
 */

import { runOcr } from './runOcr.js';

/**
 * Perform OCR on a business card image (data URL or image URL).
 * Prompt instructs the model to output ONLY extracted text, no explanations or disclaimers.
 *
 * @param {string} photoDataUrl - Data URL (data:image/...) or HTTP(S) image URL
 * @returns {Promise<string>} Normalized raw text; empty string if unreadable or error
 */
export async function performBusinessCardOcr(photoDataUrl) {
  if (!photoDataUrl || typeof photoDataUrl !== 'string') {
    return '';
  }

  const text = await runOcr(photoDataUrl, { task: 'business_card' });

  const normalised = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');

  return normalised;
}
