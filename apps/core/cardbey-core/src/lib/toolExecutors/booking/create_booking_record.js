/**

 * create_booking_record — persist booking to DB (Round 2).

 * DANH: skill-round2-booking

 */



import { createBooking } from '../../booking/bookingService.js';

import { getPrismaClient } from '../../prisma.js';

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

  const directTimeSlot =

    typeof input?.timeSlot === 'string' && input.timeSlot.trim() ? input.timeSlot.trim() : null;

  const directDate =

    typeof input?.date === 'string' && input.date.trim() ? input.date.trim() : null;



  const hasDirectBooking = Boolean(storeId && directDate && directTimeSlot);

  const hasSlotBooking = Boolean(storeId && slotId);



  if (!hasDirectBooking && !hasSlotBooking) {

    return {

      status: 'failed',

      error: { code: 'SLOT_UNAVAILABLE', message: 'storeId and slotId (or date+timeSlot) are required' },

      output: { ok: false, error: 'storeId and slotId (or date+timeSlot) are required' },

    };

  }



  return await executeAnalysisTool({

    toolName: 'create_booking_record',

    input,

    context,

    analyzer: async (inp) => {

      const date =

        directDate ||

        (typeof inp?.date === 'string' && inp.date.trim()

          ? inp.date.trim()

          : new Date().toISOString().slice(0, 10));



      let timeSlot = directTimeSlot;

      let scheduledAt = new Date(`${date}T${timeSlot ?? '09:00'}:00`).toISOString();

      let resolvedSlotId = slotId;



      if (slotId) {

        const slots = generateSlots(storeId, date);

        const slot = slots.find((s) => s.id === slotId);

        if (!slot || !slot.available) {

          throw new Error('Selected slot is not available');

        }

        timeSlot = slot.startTime;

        scheduledAt = slot.scheduledAt;

        resolvedSlotId = slotId;

      }



      if (!timeSlot) {

        throw new Error('timeSlot could not be resolved');

      }



      const reference = bookingReference(storeId, resolvedSlotId || `${date}:${timeSlot}`);

      const prisma = getPrismaClient();



      let persisted = false;

      let bookingRow = null;



      try {

        if (prisma?.booking?.create) {

          bookingRow = await createBooking(prisma, {

            storeId,

            serviceId: inp?.serviceId ?? inp?.serviceType ?? null,

            staffId: inp?.staffId ?? null,

            customerId: inp?.customerId ?? null,

            customerName: String(inp?.customerName ?? 'Guest').trim() || 'Guest',

            customerPhone: inp?.customerPhone ?? null,

            customerEmail: inp?.customerEmail ?? null,

            date,

            timeSlot,

            durationMins: inp?.durationMins ?? inp?.duration ?? 30,

            notes: inp?.notes ?? null,

            price: inp?.price ?? null,

            missionId: context?.missionId ?? inp?.missionId ?? null,

            sourceAgent: 'performer',

            metadata: { reference, slotId: resolvedSlotId },

          });

          persisted = true;

        }

      } catch (err) {

        if (process.env.NODE_ENV !== 'production') {
          console.warn('[create_booking_record] DB persist failed:', err?.message);
        }

      }



      const reminderAt = new Date(new Date(scheduledAt).getTime() - 24 * 60 * 60 * 1000).toISOString();



      const booking = {

        id: bookingRow?.id ?? `mem-${reference}`,

        storeId,

        slotId: resolvedSlotId,

        customerId: inp?.customerId ?? null,

        customerName: String(inp?.customerName ?? 'Guest').trim() || 'Guest',

        customerPhone: inp?.customerPhone ?? null,

        customerEmail: inp?.customerEmail ?? null,

        serviceType: inp?.serviceType ?? null,

        notes: inp?.notes ?? null,

        date,

        startTime: timeSlot,

        endTime: null,

        scheduledAt,

        status: bookingRow?.status ?? 'pending',

        bookedAt: bookingRow?.createdAt?.toISOString?.() ?? new Date().toISOString(),

        reminderAt,

        reference,

        persisted,

        bookingId: bookingRow?.id ?? null,

      };



      return { booking };

    },

    isEmpty: (result) => !result?.booking?.id,

    validateOutput: (result) => {

      if (!result?.booking?.persisted) {

        return {

          blocked: true,

          reason: 'not_persisted',

          message: 'Booking record created in memory only — Booking table not available',

        };

      }

      return null;

    },

  });

}



export default execute;


