/**
 * apply_offer_optimization — Apply a suggestion with optional confirmation gate.
 */

import { getPrismaClient } from '../../prisma.js';
import { executeAnalysisTool } from '../executeAnalysisTool.js';

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const storeId =
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    (typeof context?.storeId === 'string' && context.storeId.trim()) ||
    null;

  const offerId =
    typeof input?.offerId === 'string' && input.offerId.trim() ? input.offerId.trim() : null;

  const suggestion =
    input?.suggestion && typeof input.suggestion === 'object' ? input.suggestion : null;

  if (!suggestion) {
    return {
      status: 'failed',
      error: { code: 'SUGGESTION_REQUIRED', message: 'suggestion is required' },
      output: { ok: false, applied: false, requiresConfirmation: false },
    };
  }

  const confirmed = input?.confirmed === true;
  const autoApply = suggestion.autoApply === true;

  if (!confirmed && !autoApply) {
    return {
      status: 'blocked',
      reason: 'requires_user_input',
      message: 'Offer optimization requires confirmation before applying',
      blocker: {
        code: 'requires_user_input',
        message: 'Confirm the optimization suggestion to apply changes',
        requiredAction: 'confirm_offer_optimization',
      },
      output: {
        applied: false,
        requiresConfirmation: true,
        suggestion,
        storeId,
        offerId,
      },
    };
  }

  return await executeAnalysisTool({
    toolName: 'apply_offer_optimization',
    input,
    context,
    analyzer: async () => {
      if (offerId) {
        const prisma = getPrismaClient();
        const row = await prisma.promotion.findUnique({
          where: { id: offerId },
          select: { id: true, title: true },
        });
        if (!row) {
          throw new Error(`Promotion not found: ${offerId}`);
        }
      }

      return {
        applied: false,
        requiresConfirmation: false,
        suggestion,
        storeId,
        offerId,
        appliedAt: new Date().toISOString(),
        persisted: false,
      };
    },
    validateOutput: (result) => {
      if (!result?.persisted) {
        return {
          blocked: true,
          reason: 'not_persisted',
          message: 'Offer optimization confirmed but not written to promotion records yet',
        };
      }
      return null;
    },
  });
}

export default execute;
