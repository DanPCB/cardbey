/**
 * handle_booking_outcome — Resolve booking outcome and suggest follow-up action.
 */

import { executeAnalysisTool } from '../executeAnalysisTool.js';

const ALLOWED_OUTCOMES = new Set(['completed', 'cancelled', 'no_show']);

/** @type {Record<string, { triggerFollowUp: boolean, followUpType: string | null }>} */
const OUTCOME_FOLLOW_UP = {
  completed: { triggerFollowUp: true, followUpType: 'review_request' },
  no_show: { triggerFollowUp: true, followUpType: 'rebook_offer' },
  cancelled: { triggerFollowUp: true, followUpType: 'cancellation_recovery' },
};

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  const outcomeRaw = String(input?.outcome ?? '').trim().toLowerCase();
  const outcome = ALLOWED_OUTCOMES.has(outcomeRaw) ? outcomeRaw : null;

  if (!outcome) {
    return {
      status: 'failed',
      error: { code: 'VALIDATION_ERROR', message: 'outcome must be completed, cancelled, or no_show' },
      output: { ok: false, error: 'invalid outcome' },
    };
  }

  return await executeAnalysisTool({
    toolName: 'handle_booking_outcome',
    input,
    context: {},
    analyzer: (inp) => {
      const bookingId =
        typeof inp?.bookingId === 'string' && inp.bookingId.trim() ? inp.bookingId.trim() : null;

      const followUp = OUTCOME_FOLLOW_UP[outcome] ?? {
        triggerFollowUp: false,
        followUpType: null,
      };

      return {
        bookingId,
        outcome,
        reason: inp?.reason ?? null,
        refund: inp?.refund === true,
        resolvedAt: new Date().toISOString(),
        triggerFollowUp: followUp.triggerFollowUp,
        followUpType: followUp.followUpType,
      };
    },
    validateOutput: (result) => {
      if (!result?.bookingId) {
        return {
          blocked: true,
          reason: 'booking_id_required',
          message: 'bookingId is required to resolve a booking outcome',
        };
      }
      return null;
    },
  });
}

export default execute;
