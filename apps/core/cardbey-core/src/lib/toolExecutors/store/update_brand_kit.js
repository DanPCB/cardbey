/**
 * update_brand_kit — Persist brand tone, style, and color palette on DraftStore or Business.
 */

import { getPrismaClient } from '../../prisma.js';
import { updateBrandKitForStoreId, validateBrandKitPatch } from '../../../services/store/brandKitService.js';

/**
 * @param {object} [input]
 * @param {string} [input.storeId]
 * @param {string} [input.tone]
 * @param {string} [input.style]
 * @param {string[]} [input.colors]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const storeId =
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    (typeof context?.storeId === 'string' && context.storeId.trim()) ||
    null;

  if (!storeId) {
    return {
      status: 'failed',
      error: { code: 'STORE_ID_REQUIRED', message: 'storeId is required' },
    };
  }

  const validated = validateBrandKitPatch({
    tone: input.tone,
    style: input.style,
    colors: input.colors,
  });

  if (!validated.ok) {
    return {
      status: 'failed',
      error: { code: validated.code, message: validated.message },
    };
  }

  const prisma = getPrismaClient();
  const result = await updateBrandKitForStoreId(prisma, storeId, validated.data);

  if (!result.ok) {
    return {
      status: 'failed',
      error: { code: result.code, message: result.message },
    };
  }

  return {
    status: 'ok',
    output: {
      ok: true,
      storeId: result.storeId,
      targetKind: result.targetKind,
      brandKit: result.brandKit,
    },
  };
}
