/**
 * create_booking_record — Reserve a slot (in-memory until Booking model is wired).
 */

import { randomUUID } from 'node:crypto';
import { generateSlots, hashSeed } from './check_booking_availability.js';
import { executeAnalysisTool } from '../executeAnalysisTool.js';

/**
 * @param {string} storeId
 * @param {string} slotId
 * @returns {string}
 */
function bookingReference(storeId, slotId) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let seed = hashSeed(`${storeId}:${slotId}`);
  let ref = 'BK';
  for (let i = 0; i < 4; i += 1) {
    ref += chars[seed % chars.length];
    seed = Math.floor(seed / chars.length);
  }
  return ref.toUpperCase();
}

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const storeId =
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    (typeof context?.storeId === 'string' && context.storeId.trim()) ||
    null;

  const slotId = typeof input?.slotId === 'string' && input.slotId.trim() ? input.slotId.trim() : null;

  if (!storeId || !slotId) {
    return {
      status: 'failed',
      error: { code: 'SLOT_UNAVAILABLE', message: 'storeId and slotId are required' },
      output: { ok: false, error: 'storeId and slotId are required' },
    };
  }

  return await executeAnalysisTool({
    toolName: 'create_booking_record',
    input,
    context,
    analyzer: (inp) => {
      const date =
        typeof inp?.date === 'string' && inp.date.trim()
          ? inp.date.trim()
          : new Date().toISOString().slice(0, 10);

      const slots = generateSlots(storeId, date);
      const slot = slots.find((s) => s.id === slotId);

      if (!slot || !slot.available) {
        throw new Error('Selected slot is not available');
      }

      const scheduledAt = slot.scheduledAt;
      const reminderAt = new Date(new Date(scheduledAt).getTime() - 24 * 60 * 60 * 1000).toISOString();
      const reference = bookingReference(storeId, slotId);

      const booking = {
        id: randomUUID(),
        storeId,
        slotId,
        customerId: inp?.customerId ?? null,
        customerName: String(inp?.customerName ?? 'Guest').trim() || 'Guest',
        customerPhone: inp?.customerPhone ?? null,
        customerEmail: inp?.customerEmail ?? null,
        serviceType: inp?.serviceType ?? null,
        notes: inp?.notes ?? null,
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        scheduledAt,
        status: 'confirmed',
        bookedAt: new Date().toISOString(),
        reminderAt,
        reference,
        persisted: false,
      };

      return { booking };
    },
    isEmpty: (result) => !result?.booking?.id,
    validateOutput: (result) => {
      if (!result?.booking?.persisted) {
        return {
          blocked: true,
          reason: 'not_persisted',
          message: 'Booking record created in memory only — Booking model persistence not wired yet',
        };
      }
      return null;
    },
  });
}

export default execute;
