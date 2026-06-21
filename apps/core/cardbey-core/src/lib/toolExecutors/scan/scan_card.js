/**
 * scan_card — unified card scanning: OCR, entity extraction, optional product creation.
 */

import { runCardScanPipeline } from '../../vision/cardScanPipeline.js';
import { createFromScan } from '../../../services/vision/productCreator.js';
import { EXECUTION_STATES } from '../../telemetry/executionStates.js';

/**
 * @param {object} input
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const storeId =
    (typeof input?.storeId === 'string' ? input.storeId.trim() : '') ||
    (typeof context?.storeId === 'string' ? context.storeId.trim() : '');

  const userId =
    (typeof input?.userId === 'string' ? input.userId.trim() : '') ||
    (typeof context?.userId === 'string' ? context.userId.trim() : '') ||
    null;

  const imageData =
    input?.imageData ??
    input?.imageBuffer ??
    input?.imageDataUrl ??
    input?.imageUrl ??
    context?.imageDataUrl ??
    context?.imageBuffer ??
    null;

  const mimeType = input?.mimeType ?? context?.mimeType ?? 'image/jpeg';
  const confirmed = input?.confirmed === true;

  if (!storeId) {
    return {
      status: 'blocked',
      blocker: {
        code: 'STORE_ID_REQUIRED',
        message: 'Store ID is required for card scanning',
      },
      output: { executionState: EXECUTION_STATES.BLOCKED },
    };
  }

  if (!imageData) {
    return {
      status: 'blocked',
      blocker: {
        code: 'IMAGE_REQUIRED',
        message: 'Image data is required for scanning',
      },
      output: { executionState: EXECUTION_STATES.BLOCKED },
    };
  }

  try {
    const pipelineParams =
      Buffer.isBuffer(imageData) || imageData instanceof Uint8Array
        ? { buffer: imageData, mimeType, tenantKey: storeId }
        : { dataUrl: String(imageData), mimeType, tenantKey: storeId };

    const scanResult = await runCardScanPipeline(pipelineParams);

    if (!scanResult.ok) {
      const code = scanResult.error?.code ?? 'SCAN_FAILED';
      const isLowConfidence = code === 'LOW_CONFIDENCE';
      return {
        status: 'failed',
        error: {
          code,
          message: scanResult.error?.message ?? 'Failed to scan card',
        },
        output: {
          executionState: EXECUTION_STATES.FAILED,
          confidence: scanResult.confidence ?? 0,
          ocrText: scanResult.ocrText ?? '',
          ...(isLowConfidence ? { lowConfidence: true } : {}),
        },
      };
    }

    if (!confirmed) {
      return {
        status: 'ok',
        output: {
          executionState: EXECUTION_STATES.EXECUTED,
          scanned: true,
          created: false,
          requiresConfirmation: true,
          ocrText: scanResult.ocrText,
          confidence: scanResult.confidence,
          cardData: scanResult.extractedData,
          preview: scanResult.preview,
          message: 'Scan complete — confirm to create product from card data.',
        },
      };
    }

    const productResult = await createFromScan(storeId, scanResult.extractedData, userId);

    if (!productResult.ok) {
      return {
        status: 'failed',
        error: {
          code: productResult.error ?? 'CREATE_FAILED',
          message: productResult.message ?? 'Failed to create product from scan',
        },
        output: {
          executionState: EXECUTION_STATES.FAILED,
          existingProduct: productResult.existingProduct ?? null,
        },
      };
    }

    return {
      status: 'ok',
      output: {
        executionState: EXECUTION_STATES.EXECUTED,
        scanned: true,
        created: true,
        product: productResult.product,
        ocrText: scanResult.ocrText,
        confidence: scanResult.confidence,
        message: `Product "${productResult.product?.name ?? 'item'}" created from scan!`,
      },
    };
  } catch (error) {
    console.error('[scan_card] Scan failed:', error);
    return {
      status: 'failed',
      error: {
        code: 'SCAN_FAILED',
        message: `Failed to scan card: ${error?.message ?? String(error)}`,
      },
      output: { executionState: EXECUTION_STATES.FAILED },
    };
  }
}

export default execute;
