/**
 * OCR Helper
 * Extracts text from images using various OCR engines
 * Uses the OpenAI Vision Engine which handles private URLs automatically
 */

import { openaiVisionEngine } from '../../ai/engines/openaiVisionEngine.js';

/**
 * Run OCR on an image URL
 * Uses OpenAI Vision API if available, otherwise returns empty string
 * 
 * @param imageUrl - URL of the image to extract text from
 * @returns Extracted text from the image
 */
export async function runOcr(imageUrl: string): Promise<string> {
  if (!imageUrl) {
    console.warn('[OCR] No image URL provided');
    return '';
  }

  try {
    console.log('[OCR] Extracting text using OpenAI Vision API:', imageUrl);
    
    // Use the vision engine which handles private URLs automatically
    const result = await openaiVisionEngine.analyzeImage({
      imageUrl,
      task: 'menu', // Default to menu task for OCR
    });

    const text = result.text || '';
    console.log('[OCR] Extracted', text.length, 'characters');
    return text;
  } catch (error: any) {
    console.error('[OCR] OpenAI Vision API failed:', error?.message || error);
    // Fall through to return empty string
    return '';
  }
}


