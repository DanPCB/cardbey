/**
 * Booking management — availability through confirmation, reminder, and outcome.
 * DANH: skill-round2-booking
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const BookingManagementSkill = {
  name: 'booking_management',
  version: '1.0',
  description:
    'Manage the full booking lifecycle: check availability, create and confirm a booking, schedule a reminder, and handle the outcome with follow-up.',
  triggers: [
    'book_appointment',
    'create_booking',
    'manage_booking',
    'schedule_customer',
    'take_booking',
    'new_appointment',
    'reserve_slot',
    'booking',
    'appointment',
    'availability',
    'booking_summary',
    'confirm_booking',
    'cancel_booking',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  composes: ['campaign'],
  steps: [
    {
      id: 'booking_summary',
      name: 'Booking summary',
      tool: 'get_booking_summary',
      required: false,
      condition: (ctx) =>
        Boolean(
          ctx.toolInput?.subIntent === 'get_summary' ||
            ctx.toolInput?.action === 'get_summary' ||
            /summary/i.test(String(ctx.toolInput?.prompt ?? '')),
        ),
      buildInput: (ctx) => ({ storeId: ctx.storeId }),
    },
    {
      id: 'check_availability',
      name: 'Check availability',
      tool: 'check_booking_availability',
      required: true,
      buildInput: (ctx) => ({
        storeId: ctx.storeId,
        serviceType: ctx.toolInput?.serviceType || null,
        date: ctx.toolInput?.date || null,
        duration: ctx.toolInput?.duration || 60,
        partySize: ctx.toolInput?.partySize || 1,
      }),
    },
    {
      id: 'create_booking',
      name: 'Create booking',
      tool: 'create_booking_record',
      required: true,
      condition: (ctx, stepResults) =>
        (stepResults.check_availability?.output?.availability?.openSlots ?? 0) > 0,
      buildInput: (ctx, stepResults) => ({
        storeId: ctx.storeId,
        slotId: stepResults.check_availability?.output?.availability?.slots?.find(
          (s) => s.available,
        )?.id,
        date: stepResults.check_availability?.output?.availability?.date,
        customerName: ctx.toolInput?.customerName || 'Guest',
        customerPhone: ctx.toolInput?.customerPhone || null,
        customerEmail: ctx.toolInput?.customerEmail || null,
        serviceType: ctx.toolInput?.serviceType || null,
        notes: ctx.toolInput?.notes || null,
      }),
    },
    {
      id: 'confirm_customer',
      name: 'Confirm with customer',
      tool: 'confirm_booking_customer',
      required: false,
      condition: (ctx, stepResults) => !!stepResults.create_booking?.output?.booking,
      buildInput: (ctx, stepResults) => ({
        booking: stepResults.create_booking?.output?.booking,
        channel: ctx.toolInput?.channel || 'whatsapp',
      }),
    },
    {
      id: 'schedule_reminder',
      name: 'Schedule reminder',
      tool: 'schedule_booking_reminder',
      required: false,
      condition: (ctx, stepResults) => !!stepResults.create_booking?.output?.booking,
      buildInput: (ctx, stepResults) => ({
        booking: stepResults.create_booking?.output?.booking,
        reminderLeadHours: ctx.toolInput?.reminderLeadHours || 24,
      }),
    },
    {
      id: 'handle_outcome',
      name: 'Handle booking outcome',
      tool: 'handle_booking_outcome',
      required: false,
      condition: (ctx) => !!ctx.toolInput?.outcome,
      buildInput: (ctx) => ({
        bookingId: ctx.toolInput?.bookingId || null,
        outcome: ctx.toolInput?.outcome,
        reason: ctx.toolInput?.reason || null,
        refund: ctx.toolInput?.refund || false,
      }),
    },
  ],
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 1500,
    shouldRetry: (error) =>
      error?.code !== 'VALIDATION_ERROR' &&
      error?.code !== 'PERMISSION_DENIED' &&
      error?.code !== 'SLOT_UNAVAILABLE',
  },
};

if (!skillRegistry.has(BookingManagementSkill.name)) {
  skillRegistry.register(BookingManagementSkill);
}
