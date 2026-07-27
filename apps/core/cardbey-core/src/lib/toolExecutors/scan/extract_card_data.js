// DANH: skill-round5-cardscan
/**
 * extract_card_data — OCR + entity extraction from card/product image.
 */

import { runCardScanPipeline } from '../../vision/cardScanPipeline.js';

export async function execute(input = {}, context = {}) {
  const imageUrl =
    (typeof input?.imageUrl === 'string' && input.imageUrl) ||
    (typeof input?.imageDataUrl === 'string' && input.imageDataUrl) ||
    (typeof context?.imageDataUrl === 'string' && context.imageDataUrl) ||
    null;

  const imageBuffer = input?.imageBuffer ?? context?.imageBuffer ?? null;
  const mimeType = input?.mimeType ?? context?.mimeType ?? 'image/jpeg';
  const scanType = input?.scanType ?? 'business_card';
  const storeId = input?.storeId ?? context?.storeId ?? null;

  if (!imageUrl && !imageBuffer) {
    const available = input?.available === true;
    if (!available) {
      return {
        status: 'ok',
        output: {
          extracted: false,
          reason: 'No image provided and OCR bridge unavailable',
        },
      };
    }
    return {
      status: 'ok',
      output: {
        extracted: false,
        reason: 'Image URL or buffer required for card scan',
      },
    };
  }

  const result = await runCardScanPipeline({
    dataUrl: imageUrl ?? undefined,
    buffer: imageBuffer ?? undefined,
    mimeType,
    scanType,
    tenantKey: storeId ?? context?.tenantId ?? 'default',
  });

  if (!result.ok) {
    return {
      status: 'ok',
      output: {
        extracted: false,
        reason: result.error?.message ?? 'Scan failed',
        code: result.error?.code,
        ocrText: result.ocrText ?? '',
        confidence: result.confidence ?? 0,
      },
    };
  }

  return {
    status: 'ok',
    output: {
      extracted: true,
      ocrText: result.ocrText,
      confidence: result.confidence,
      cardData: result.extractedData,
      preview: result.preview,
    },
  };
}

export default execute;
