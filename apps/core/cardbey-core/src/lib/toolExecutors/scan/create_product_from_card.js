// DANH: skill-round5-cardscan
/**
 * create_product_from_card — creates catalog product when user confirmed scan data.
 */

import { createFromScan } from '../../../services/vision/productCreator.js';

export async function execute(input = {}, context = {}) {
  const extracted = input?.extracted === true;
  const cardData = input?.cardData ?? input?.extractedData ?? null;
  const storeId =
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    (typeof context?.storeId === 'string' && context.storeId.trim()) ||
    null;
  const userId =
    (typeof input?.userId === 'string' && input.userId) ||
    (typeof context?.userId === 'string' && context.userId) ||
    null;
  const confirmed = input?.confirmed === true;

  if (!extracted || !cardData) {
    return {
      status: 'ok',
      output: {
        created: false,
        reason: 'No extracted card data — run extract_card_data first',
      },
    };
  }

  if (!confirmed) {
    return {
      status: 'ok',
      output: {
        created: false,
        reason: 'User confirmation required before creating product from scan',
        preview: cardData,
        requiresConfirmation: true,
      },
    };
  }

  if (!storeId) {
    return {
      status: 'failed',
      error: { code: 'VALIDATION_ERROR', message: 'storeId is required' },
      output: { created: false, reason: 'storeId is required' },
    };
  }

  const result = await createFromScan(storeId, cardData, userId);

  if (!result.ok) {
    return {
      status: 'failed',
      error: { code: result.error ?? 'CREATE_FAILED', message: result.message },
      output: {
        created: false,
        reason: result.message,
        existingProduct: result.existingProduct ?? null,
      },
    };
  }

  return {
    status: 'ok',
    output: {
      created: true,
      product: result.product,
      message: result.message,
    },
  };
}

export default execute;
