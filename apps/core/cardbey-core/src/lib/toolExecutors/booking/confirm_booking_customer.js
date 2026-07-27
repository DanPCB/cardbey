/**
 * confirm_booking_customer — Build booking confirmation message (send channel not wired).
 */

import { executeAnalysisTool } from '../executeAnalysisTool.js';

const ALLOWED_CHANNELS = new Set(['whatsapp', 'email', 'sms']);

/**
 * @param {object} booking
 * @param {string} channel
 * @returns {string}
 */
function buildConfirmationMessage(booking, channel) {
  const customerName = booking?.customerName || 'there';
  const storeLabel = booking?.storeId ? `store ${booking.storeId}` : 'your store';
  const date = booking?.date || 'your appointment date';
  const startTime = booking?.startTime || 'your appointment time';
  const reference = booking?.reference || 'N/A';

  const base = `Hi ${customerName}! Your booking at ${storeLabel} is confirmed for ${date} at ${startTime}. Reference: ${reference}. Reply CANCEL to cancel.`;

  if (channel === 'email') {
    return `Subject: Booking confirmed\n\n${base}`;
  }
  return base;
}

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  const booking = input?.booking && typeof input.booking === 'object' ? input.booking : null;

  if (!booking) {
    return {
      status: 'failed',
      error: { code: 'BOOKING_REQUIRED', message: 'booking is required' },
      output: { ok: false, confirmed: false },
    };
  }

  return await executeAnalysisTool({
    toolName: 'confirm_booking_customer',
    input,
    context: {},
    analyzer: (inp) => {
      const channelRaw = String(inp?.channel ?? 'whatsapp').trim().toLowerCase() || 'whatsapp';
      const channel = ALLOWED_CHANNELS.has(channelRaw) ? channelRaw : 'whatsapp';
      const message = buildConfirmationMessage(booking, channel);

      return {
        confirmed: false,
        channel,
        message,
        preparedAt: new Date().toISOString(),
        bookingId: booking.id ?? null,
        requiresSend: true,
      };
    },
    isEmpty: (result) => !String(result?.message ?? '').trim(),
    validateOutput: () => ({
      blocked: true,
      reason: 'requires_user_input',
      message: 'Confirmation message prepared but not sent — wire notification channel to complete delivery',
    }),
  });
}

export default execute;
