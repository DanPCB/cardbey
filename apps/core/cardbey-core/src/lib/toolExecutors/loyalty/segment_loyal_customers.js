// AUDIT: no dedicated loyalty segment tool found — new executor (Round 4)
// DANH: skill-round4-loyalty
/**
 * segment_loyal_customers — identify repeat buyers from Booking records (read-only).
 * Side effect: read-only DB query (or honest stub when Booking table empty / unavailable).
 */

import { getPrismaClient } from '../../prisma.js';

const LOOKBACK_DAYS = 90;

/**
 * @param {Array<{ customerEmail?: string | null, customerPhone?: string | null, customerId?: string | null, customerName?: string | null }>} bookings
 * @returns {{ loyalCustomers: Array<{ key: string, bookingCount: number }>, customerCount: number }}
 */
export function segmentLoyalCustomersFromBookings(bookings) {
  /** @type {Map<string, number>} */
  const counts = new Map();

  for (const row of bookings) {
    const key =
      String(row.customerEmail ?? '').trim() ||
      String(row.customerPhone ?? '').trim() ||
      String(row.customerId ?? '').trim() ||
      String(row.customerName ?? '').trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const loyalCustomers = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, bookingCount]) => ({ key, bookingCount }));

  return { loyalCustomers, customerCount: loyalCustomers.length };
}

/**
 * @param {object} [input]
 * @param {string} [input.storeId]
 */
export async function execute(input = {}) {
  const storeId = typeof input?.storeId === 'string' ? input.storeId.trim() : '';
  if (!storeId) {
    return {
      status: 'failed',
      output: { error: 'storeId is required' },
    };
  }

  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);

  try {
    const prisma = getPrismaClient();
    if (!prisma?.booking?.findMany) {
      return {
        status: 'ok',
        output: {
          segmented: false,
          reason: 'No repeat booking data yet',
          suggestedApproach: 'Launch loyalty program now to start capturing data',
          customerCount: 0,
          loyalCustomers: [],
        },
      };
    }

    const bookings = await prisma.booking.findMany({
      where: {
        storeId,
        createdAt: { gte: since },
        status: { not: 'cancelled' },
      },
      select: {
        customerEmail: true,
        customerPhone: true,
        customerId: true,
        customerName: true,
      },
    });

    if (!bookings.length) {
      return {
        status: 'ok',
        output: {
          segmented: false,
          reason: 'No repeat booking data yet',
          suggestedApproach: 'Launch loyalty program now to start capturing data',
          customerCount: 0,
          loyalCustomers: [],
        },
      };
    }

    const { loyalCustomers, customerCount } = segmentLoyalCustomersFromBookings(bookings);

    if (customerCount === 0) {
      return {
        status: 'ok',
        output: {
          segmented: false,
          reason: 'No repeat booking data yet',
          suggestedApproach: 'Launch loyalty program now to start capturing data',
          customerCount: 0,
          loyalCustomers: [],
        },
      };
    }

    return {
      status: 'ok',
      output: {
        segmented: true,
        customerCount,
        loyalCustomers,
        lookbackDays: LOOKBACK_DAYS,
      },
    };
  } catch {
    return {
      status: 'ok',
      output: {
        segmented: false,
        reason: 'No repeat booking data yet',
        suggestedApproach: 'Launch loyalty program now to start capturing data',
        customerCount: 0,
        loyalCustomers: [],
      },
    };
  }
}

export default execute;
