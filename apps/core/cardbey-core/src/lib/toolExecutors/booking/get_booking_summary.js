/**
 * get_booking_summary — booking counts for a store (Round 2).
 * DANH: skill-round2-booking
 */

import { getBookingSummary } from '../../booking/bookingService.js';
import { getPrismaClient } from '../../prisma.js';
import { executeAnalysisTool } from '../executeAnalysisTool.js';

/**
 * @param {object} [input]
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
      error: { code: 'VALIDATION_ERROR', message: 'storeId is required' },
      output: { ok: false, error: 'storeId is required' },
    };
  }

  const prisma = getPrismaClient();

  return executeAnalysisTool({
    toolName: 'get_booking_summary',
    input,
    context,
    analyzer: async () => {
      const summary = await getBookingSummary(prisma, storeId);
      // Side effect: aggregated Booking counts from DB for storeId.
      return {
        summary,
        message: `${summary.total} total bookings, ${summary.pending} pending, ${summary.today} today`,
      };
    },
    isEmpty: () => false,
  });
}

export default execute;
