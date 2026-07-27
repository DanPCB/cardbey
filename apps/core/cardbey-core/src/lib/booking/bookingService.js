// DANH: skill-round2-booking

/**
 * Booking persistence and availability — shared by MI routes, tool executors, and skills.
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} data
 */
export async function createBooking(prisma, data) {
  const {
    storeId,
    serviceId,
    staffId,
    customerId,
    customerName,
    customerEmail,
    customerPhone,
    date,
    timeSlot,
    durationMins,
    notes,
    price,
    currency,
    sourceAgent,
    missionId,
    metadata,
  } = data;

  return prisma.booking.create({
    data: {
      storeId,
      serviceId: serviceId ?? null,
      staffId: staffId ?? null,
      customerId: customerId ?? null,
      customerName: customerName ?? null,
      customerEmail: customerEmail ?? null,
      customerPhone: customerPhone ?? null,
      date,
      timeSlot,
      durationMins: durationMins ?? 30,
      status: 'pending',
      notes: notes ?? null,
      price: price ?? null,
      currency: currency ?? 'AUD',
      sourceAgent: sourceAgent ?? 'performer',
      missionId: missionId ?? null,
      metadata: metadata ?? undefined,
    },
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 * @param {object} [filters]
 */
export async function getBookingsForStore(prisma, storeId, filters = {}) {
  const { status, fromDate, toDate, limit = 50 } = filters;

  const dateFilter =
    fromDate || toDate
      ? {
          date: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {};

  return prisma.booking.findMany({
    where: {
      storeId,
      ...(status ? { status } : {}),
      ...dateFilter,
    },
    orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }],
    take: limit,
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} bookingId
 * @param {string} status
 * @param {object} [options]
 */
export async function updateBookingStatus(prisma, bookingId, status, options = {}) {
  const { notes } = options;
  return prisma.booking.update({
    where: { id: bookingId },
    data: {
      status,
      ...(notes ? { notes } : {}),
    },
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 * @param {object} params
 */
export async function checkAvailability(prisma, storeId, params) {
  const { date, timeSlot, durationMins = 30, staffId } = params;

  const conflicts = await prisma.booking.findMany({
    where: {
      storeId,
      date,
      status: { notIn: ['cancelled'] },
      ...(staffId ? { staffId } : {}),
      timeSlot,
    },
  });

  return {
    available: conflicts.length === 0,
    conflicts: conflicts.length,
    date,
    timeSlot,
    durationMins,
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 */
export async function getBookingSummary(prisma, storeId) {
  const today = new Date().toISOString().split('T')[0];

  const [total, pending, confirmed, todayCount] = await Promise.all([
    prisma.booking.count({ where: { storeId } }),
    prisma.booking.count({ where: { storeId, status: 'pending' } }),
    prisma.booking.count({ where: { storeId, status: 'confirmed' } }),
    prisma.booking.count({ where: { storeId, date: today } }),
  ]);

  return { total, pending, confirmed, today: todayCount };
}

/**
 * Load booked time slots for a store on a date (for slot generation).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 * @param {string} date
 * @returns {Promise<Set<string>>}
 */
export async function getBookedTimeSlotsForDate(prisma, storeId, date) {
  const rows = await prisma.booking.findMany({
    where: {
      storeId,
      date,
      status: { notIn: ['cancelled'] },
    },
    select: { timeSlot: true },
  });
  return new Set(rows.map((r) => r.timeSlot).filter(Boolean));
}
