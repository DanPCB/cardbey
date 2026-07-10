/**
 * Owner booking list — includes linked Stripe payment status.
 */

import { Router } from 'express';
import { requireAuth, requireStoreOwner } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { getBookingsForStore } from '../lib/booking/bookingService.js';

const router = Router({ mergeParams: true });

router.use(requireAuth, requireStoreOwner);

/** GET /api/stores/:storeId/bookings */
router.get('/', async (req, res, next) => {
  try {
    const prisma = getPrismaClient();
    const storeId = req.params.storeId;
    const bookings = await getBookingsForStore(prisma, storeId, {
      status: req.query.status != null ? String(req.query.status) : undefined,
      limit: Number(req.query.limit) || 50,
    });

    const bookingIds = bookings.map((b) => b.id);
    const payments =
      bookingIds.length > 0
        ? await prisma.payment.findMany({
            where: {
              storeId,
              linkedEntityType: 'booking',
              linkedEntityId: { in: bookingIds },
            },
            orderBy: { createdAt: 'desc' },
          })
        : [];

    const paymentByBooking = new Map();
    for (const payment of payments) {
      if (payment.linkedEntityId && !paymentByBooking.has(payment.linkedEntityId)) {
        paymentByBooking.set(payment.linkedEntityId, payment);
      }
    }

    const enriched = bookings.map((booking) => ({
      ...booking,
      paymentStatus:
        paymentByBooking.get(booking.id)?.status ??
        (booking.status === 'pending_payment' ? 'pending' : null),
    }));

    res.json({ ok: true, bookings: enriched });
  } catch (err) {
    next(err);
  }
});

export { router as bookingOwnerRoutes };
