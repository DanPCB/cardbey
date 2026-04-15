/**
 * Promotion tool: activate_promotion.
 * Input: { promotionId? }. When promotionId is provided, marks Promotion.status as 'active'.
 * When missing (e.g. stubbed pipelines), returns a no-op success with promotionId: null.
 *
 * @param {object} input
 * @returns {Promise<{ status: 'ok' | 'failed', output?: { promotionId: string | null, title?: string | null, status?: string, activated: boolean }, error?: { code: string, message: string } }>}
 */

import { getPrismaClient } from '../../../lib/prisma.js';

export async function execute(input = {}) {
  const promotionId = typeof input.promotionId === 'string' ? input.promotionId.trim() : '';

  if (!promotionId) {
    return {
      status: 'ok',
      output: {
        promotionId: null,
        activated: true,
      },
    };
  }

  const prisma = getPrismaClient();

  try {
    const promotion = await prisma.promotion.update({
      where: { id: promotionId },
      data: { status: 'active' },
    });

    return {
      status: 'ok',
      output: {
        promotionId: promotion.id,
        title: promotion.title,
        status: promotion.status,
        activated: true,
      },
    };
  } catch (err) {
    console.error('[activate_promotion] executor error:', err);
    return {
      status: 'failed',
      error: {
        code: 'EXECUTOR_ERROR',
        message: err?.message ?? 'Unknown activate_promotion error',
      },
    };
  }
}
