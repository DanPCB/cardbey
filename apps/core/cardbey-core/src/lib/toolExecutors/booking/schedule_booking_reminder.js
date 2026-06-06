/**
 * schedule_booking_reminder — Queue reminder notification record (send not wired).
 */

import { randomUUID } from 'node:crypto';
import { executeAnalysisTool } from '../executeAnalysisTool.js';

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  const booking = input?.booking && typeof input.booking === 'object' ? input.booking : null;

  if (!booking) {
    return {
      status: 'failed',
      error: { code: 'BOOKING_REQUIRED', message: 'booking is required' },
      output: { ok: false },
    };
  }

  return await executeAnalysisTool({
    toolName: 'schedule_booking_reminder',
    input,
    context: {},
    analyzer: (inp) => {
      const leadRaw = Number(inp?.reminderLeadHours);
      const reminderLeadHours =
        Number.isFinite(leadRaw) && leadRaw > 0 ? Math.min(Math.floor(leadRaw), 168) : 24;

      const scheduledAtSource = booking.scheduledAt || booking.reminderAt || new Date().toISOString();
      const scheduledAt = new Date(
        new Date(scheduledAtSource).getTime() - reminderLeadHours * 60 * 60 * 1000,
      ).toISOString();

      const customerName = booking.customerName || 'there';
      const startTime = booking.startTime || 'your appointment';
      const date = booking.date || 'soon';
      const reference = booking.reference || '';

      const message = `Reminder: Hi ${customerName}, your appointment is on ${date} at ${startTime}. Reference: ${reference}.`;

      const reminder = {
        id: randomUUID(),
        bookingId: booking.id,
        scheduledAt,
        message,
        status: 'scheduled',
        reminderLeadHours,
        sent: false,
      };

      return { reminder };
    },
    isEmpty: (result) => !String(result?.reminder?.message ?? '').trim(),
    validateOutput: () => ({
      blocked: true,
      reason: 'reminder_not_scheduled',
      message: 'Reminder message prepared but not queued to a notification provider',
    }),
  });
}

export default execute;
