import { describe, it, expect } from 'vitest';
import { execute as checkBookingAvailability } from '../../toolExecutors/booking/check_booking_availability.js';
import { execute as createBookingRecord } from '../../toolExecutors/booking/create_booking_record.js';
import { execute as confirmBookingCustomer } from '../../toolExecutors/booking/confirm_booking_customer.js';
import { execute as scheduleBookingReminder } from '../../toolExecutors/booking/schedule_booking_reminder.js';
import { execute as handleBookingOutcome } from '../../toolExecutors/booking/handle_booking_outcome.js';

describe('booking executors', () => {
  const storeId = 'booking-store-1';
  const date = '2026-06-10';

  it('check_booking_availability returns slots and openSlots count', async () => {
    const result = await checkBookingAvailability({ storeId, date });

    expect(result.status).toBe('ok');
    expect(result.output?.availability?.storeId).toBe(storeId);
    expect(result.output?.availability?.slots?.length).toBeGreaterThan(0);
    expect(result.output?.availability?.openSlots).toBeGreaterThanOrEqual(0);
    expect(result.output?.availability?.totalSlots).toBe(result.output?.availability?.slots?.length);
  });

  it('availability generates 9:00–17:00 slots', async () => {
    const result = await checkBookingAvailability({ storeId, date, duration: 60 });
    const slots = result.output?.availability?.slots ?? [];

    expect(slots[0]?.startTime).toBe('09:00');
    expect(slots[slots.length - 1]?.endTime).toBe('17:00');
    expect(slots.length).toBe(8);
  });

  it('create_booking_record returns booking with reference code', async () => {
    const availability = await checkBookingAvailability({ storeId, date });
    const openSlot = availability.output?.availability?.slots?.find((s) => s.available);

    expect(openSlot).toBeTruthy();

    const result = await createBookingRecord({
      storeId,
      slotId: openSlot.id,
      date,
      customerName: 'Jane Doe',
      customerPhone: '+61000000000',
    });

    expect(result.status).toBe('ok');
    expect(result.output?.booking?.customerName).toBe('Jane Doe');
    expect(result.output?.booking?.reference).toMatch(/^[A-Z0-9]{6}$/);
    expect(result.output?.booking?.status).toBe('confirmed');
  });

  it('confirm_booking_customer message contains customerName', async () => {
    const booking = {
      id: 'booking-1',
      storeId,
      customerName: 'Alex',
      date: '2026-06-10',
      startTime: '10:00',
      reference: 'BK12AB',
    };

    const result = await confirmBookingCustomer({ booking });

    expect(result.status).toBe('ok');
    expect(result.output?.message).toContain('Alex');
    expect(result.output?.message).toContain('BK12AB');
  });

  it('confirm channel defaults to whatsapp', async () => {
    const result = await confirmBookingCustomer({
      booking: { customerName: 'Sam', storeId, date: '2026-06-10', startTime: '11:00', reference: 'BK99ZZ' },
    });

    expect(result.output?.channel).toBe('whatsapp');
  });

  it('schedule_booking_reminder scheduledAt is 24h before slot', async () => {
    const scheduledAt = '2026-06-10T10:00:00.000Z';
    const booking = {
      id: 'booking-2',
      customerName: 'Riley',
      date: '2026-06-10',
      startTime: '10:00',
      scheduledAt,
      reference: 'BK45CD',
    };

    const result = await scheduleBookingReminder({ booking, reminderLeadHours: 24 });
    const reminderAt = new Date(result.output?.reminder?.scheduledAt).getTime();
    const slotAt = new Date(scheduledAt).getTime();
    const diffHours = (slotAt - reminderAt) / (60 * 60 * 1000);

    expect(result.status).toBe('ok');
    expect(diffHours).toBeCloseTo(24, 1);
  });

  it('handle_booking_outcome completed → followUpType review_request', async () => {
    const result = await handleBookingOutcome({ bookingId: 'b1', outcome: 'completed' });

    expect(result.status).toBe('ok');
    expect(result.output?.triggerFollowUp).toBe(true);
    expect(result.output?.followUpType).toBe('review_request');
  });

  it('handle_booking_outcome no_show → followUpType rebook_offer', async () => {
    const result = await handleBookingOutcome({ bookingId: 'b2', outcome: 'no_show' });

    expect(result.output?.followUpType).toBe('rebook_offer');
  });

  it('handle_booking_outcome cancelled → followUpType cancellation_recovery', async () => {
    const result = await handleBookingOutcome({ bookingId: 'b3', outcome: 'cancelled' });

    expect(result.output?.followUpType).toBe('cancellation_recovery');
  });
});
