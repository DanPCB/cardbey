/**
 * Shared scan-card pipeline: OCR → entity extraction → optional product preview.
 */

import { extractText } from '../../services/vision/ocrService.js';
import { extractEntities } from '../../services/vision/entityExtractor.js';

/**
 * @param {{ buffer?: Buffer, dataUrl?: string, mimeType?: string, scanType?: string, tenantKey?: string }} params
 */
export async function runCardScanPipeline(params = {}) {
  const mimeType = params.mimeType || 'image/jpeg';
  const imageInput = params.buffer ?? params.dataUrl ?? null;

  if (!imageInput) {
    return {
      ok: false,
      error: { code: 'NO_IMAGE', message: 'Please provide an image to scan.' },
    };
  }

  const ocrResult = await extractText(imageInput, { mimeType });
  if (ocrResult.error && !ocrResult.text) {
    return {
      ok: false,
      error: { code: 'OCR_FAILED', message: ocrResult.error },
    };
  }

  if (!ocrResult.text || ocrResult.lowConfidence) {
    return {
      ok: false,
      error: {
        code: 'LOW_CONFIDENCE',
        message: 'Image quality is low or text was not readable. Please take a clearer photo.',
      },
      confidence: ocrResult.confidence ?? 0,
      ocrText: ocrResult.text ?? '',
    };
  }

  const scanType = params.scanType === 'product_tag' ? 'product_tag' : 'business_card';
  const entities = await extractEntities(
    ocrResult.text,
    scanType,
    params.tenantKey ?? 'default',
  );

  return {
    ok: true,
    ocrText: ocrResult.text,
    confidence: ocrResult.confidence,
    provider: ocrResult.provider,
    extractedData: entities,
    preview: {
      name: entities.name,
      description: entities.description,
      category: entities.category,
      phone: entities.phone,
      email: entities.email,
      website: entities.website,
      address: entities.address,
    },
  };
}

export default { runCardScanPipeline };
