/**
 * Menu OCR Helper
 * Extracts and normalizes text from menu images for LLM parsing
 */

import { runOcr } from '../vision/runOcr.js';

/**
 * Perform OCR on a menu image
 * Downloads image, runs OCR, and normalizes the text output
 * 
 * @param {string} imageUrl - URL of the menu image
 * @returns {Promise<string>} Normalized OCR text ready for LLM parsing
 */
export async function performMenuOcr(imageUrl) {
  console.log('[Menu OCR] Starting OCR for image', imageUrl);

  // Run OCR using the base OCR helper
  const text = await runOcr(imageUrl);

  // Normalize the text:
  // - Normalize line endings (Windows \r\n -> \n)
  // - Trim each line
  // - Remove empty lines
  // - Join with single newlines
  const normalised = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n') // Handle old Mac line endings
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean) // Remove empty lines
    .join('\n');

  console.log('[Menu OCR] Finished OCR, length:', normalised.length, 'characters');

  // If OCR returned empty, return mock data for development
  if (!normalised && !process.env.OPENAI_API_KEY) {
    console.log('[Menu OCR] Using mock OCR data (OpenAI not configured)');
    return `FLAT WHITE 5.00
LATTE 5.50
CAPPUCCINO 5.50
MOCHA 6.00
MACCHIATO 5.00
LONG BLACK 4.50
HOT CHOCOLATE 5.50
TEA 4.00
CHAI LATTE 5.50
BATCH BREW 4.00
PICCOLO LATTE 5.00
ESPRESSO 3.50`;
  }

  return normalised;
}


