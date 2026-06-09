// DANH: skill-round2-booking
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkAvailability,
  createBooking,
  getBookingSummary,
  getBookingsForStore,
  updateBookingStatus,
} from './bookingService.js';

describe('bookingService', () => {
  /** @type {object} */
  let prisma;

  beforeEach(() => {
    prisma = {
      booking: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
    };
  });

  it('createBooking persists pending row with defaults', async () => {
    prisma.booking.create.mockResolvedValue({
      id: 'bk-1',
      storeId: 'store-1',
      status: 'pending',
      date: '2026-06-10',
      timeSlot: '10:00',
    });

    const row = await createBooking(prisma, {
      storeId: 'store-1',
      date: '2026-06-10',
      timeSlot: '10:00',
      customerName: 'Jane',
    });

    expect(row.id).toBe('bk-1');
    expect(prisma.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeId: 'store-1',
          status: 'pending',
          currency: 'AUD',
          sourceAgent: 'performer',
        }),
      }),
    );
  });

  it('checkAvailability returns available:true when no conflicts', async () => {
    prisma.booking.findMany.mockResolvedValue([]);
    const result = await checkAvailability(prisma, 'store-1', {
      date: '2026-06-10',
      timeSlot: '10:00',
    });
    expect(result.available).toBe(true);
    expect(result.conflicts).toBe(0);
  });

  it('checkAvailability returns available:false when conflict exists', async () => {
    prisma.booking.findMany.mockResolvedValue([{ id: 'bk-2' }]);
    const result = await checkAvailability(prisma, 'store-1', {
      date: '2026-06-10',
      timeSlot: '10:00',
    });
    expect(result.available).toBe(false);
    expect(result.conflicts).toBe(1);
  });

  it('getBookingSummary returns booking counts', async () => {
    prisma.booking.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2);

    const summary = await getBookingSummary(prisma, 'store-1');
    expect(summary).toEqual({ total: 10, pending: 3, confirmed: 5, today: 2 });
  });

  it('updateBookingStatus updates status to confirmed', async () => {
    prisma.booking.update.mockResolvedValue({ id: 'bk-1', status: 'confirmed' });
    const row = await updateBookingStatus(prisma, 'bk-1', 'confirmed');
    expect(row.status).toBe('confirmed');
  });

  it('getBookingsForStore filters by status and date range', async () => {
    prisma.booking.findMany.mockResolvedValue([{ id: 'bk-1' }]);
    const rows = await getBookingsForStore(prisma, 'store-1', {
      status: 'pending',
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
    });
    expect(rows).toHaveLength(1);
    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 'store-1',
          status: 'pending',
          date: { gte: '2026-06-01', lte: '2026-06-30' },
        }),
      }),
    );
  });
});
