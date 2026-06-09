/**
 * check_booking_availability — slot generation with DB conflict overlay (Round 2).
 * DANH: skill-round2-booking
 */

import { randomUUID } from 'node:crypto';
import { getBookedTimeSlotsForDate } from '../../booking/bookingService.js';
import { getPrismaClient } from '../../prisma.js';
import { executeAnalysisTool } from '../executeAnalysisTool.js';

const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 17;

/**
 * @param {string} seed
 * @returns {number}
 */
export function hashSeed(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * @param {string} dateStr
 * @returns {string}
 */
function resolveDate(dateStr) {
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    return dateStr.trim();
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {string} storeId
 * @param {string} date
 * @param {number} durationMinutes
 * @param {Set<string>} [bookedTimeSlots]
 * @returns {Array<object>}
 */
export function generateSlots(storeId, date, durationMinutes = 60, bookedTimeSlots = new Set()) {
  const stepHours = Math.max(1, Math.floor(durationMinutes / 60));
  /** @type {Array<object>} */
  const slots = [];

  for (let hour = BUSINESS_START_HOUR; hour + stepHours <= BUSINESS_END_HOUR; hour += stepHours) {
    const startTime = `${String(hour).padStart(2, '0')}:00`;
    const endHour = hour + stepHours;
    const endTime = `${String(endHour).padStart(2, '0')}:00`;
    const slotSeed = hashSeed(`${storeId}:${date}:${startTime}`);
    const dbBooked = bookedTimeSlots.has(startTime);
    const available = !dbBooked && slotSeed % 10 < 7;
    const id = `slot-${hashSeed(`${storeId}|${date}|${startTime}`).toString(16).padStart(8, '0')}`;

    slots.push({
      id,
      startTime,
      endTime,
      available,
      capacity: available ? Math.max(1, (slotSeed % 3) + 1) : 0,
      scheduledAt: new Date(`${date}T${startTime}:00`).toISOString(),
      dbConflict: dbBooked,
    });
  }

  return slots;
}

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  return await executeAnalysisTool({
    toolName: 'check_booking_availability',
    input,
    context,
    analyzer: async (inp) => {
      const storeId =
        (typeof inp?.storeId === 'string' && inp.storeId.trim()) ||
        (typeof context?.storeId === 'string' && context.storeId.trim()) ||
        'unknown-store';

      const date = resolveDate(inp?.date);
      const durationRaw = Number(inp?.duration);
      const duration =
        Number.isFinite(durationRaw) && durationRaw > 0 ? Math.min(Math.floor(durationRaw), 240) : 60;
      const partySizeRaw = Number(inp?.partySize);
      const partySize =
        Number.isFinite(partySizeRaw) && partySizeRaw > 0 ? Math.floor(partySizeRaw) : 1;

      let bookedTimeSlots = new Set();
      try {
        const prisma = getPrismaClient();
        if (prisma?.booking?.findMany) {
          bookedTimeSlots = await getBookedTimeSlotsForDate(prisma, storeId, date);
        }
      } catch {
        /* Booking table may not exist until migration — fall back to hash slots only */
      }

      const slots = generateSlots(storeId, date, duration, bookedTimeSlots);
      const openSlots = slots.filter((s) => s.available);
      const nextAvailable = openSlots[0]?.scheduledAt ?? null;

      // Side effect: read Booking rows for storeId+date to mark conflicting slots unavailable.
      return {
        availability: {
          storeId,
          serviceType: inp?.serviceType ?? null,
          date,
          duration,
          partySize,
          slots,
          nextAvailable,
          totalSlots: slots.length,
          openSlots: openSlots.length,
          availabilityId: randomUUID(),
          checkedAt: new Date().toISOString(),
          dbBacked: bookedTimeSlots.size > 0,
        },
      };
    },
    isEmpty: (result) => (result?.availability?.openSlots ?? 0) < 1,
    countRecords: (result) => result?.availability?.openSlots ?? 0,
  });
}

export default execute;
